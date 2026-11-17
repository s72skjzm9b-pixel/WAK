import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { makeStudio, writer, approver, seed, tmpDir, onPostgres } from './helpers';
import { buildCollections } from '@/server/domain/collections';
import { parseWorkbook } from '@/server/workbook/parse';
import { buildLibrary } from '@/server/domain/library';
import { saveEdit, saveNewCopy, accept, markReady, returnForEditing, keepAgainstCurrent, openSuggestion, approveMeaning, separateVersion, useIdea } from '@/server/domain/suggestions';
import { workspaceView } from '@/server/domain/workspace';
import { setVerdict, addComment } from '@/server/domain/feedback';
import { planReplacement } from '@/server/domain/writeplan';
import { Studio } from '@/server/domain/studio';
import { Repo } from '@/server/store/repo';
import { openDb } from '@/server/store/db';
import { SnapshotGateway } from '@/server/sheets/snapshot';
import { SheetError } from '@/server/sheets/gateway';
import { rowsFor, collectionCombos, feedbackFor, lineNeedsWork, translationApprovalFlag } from '@/lib/workspace';
import { readinessFor } from '@/lib/readiness';
import { handoffItems, impactOf, stageOf } from '@/lib/handoff';
import { validateText } from '@/lib/limits';

const p = parseWorkbook(seed());
const cols = buildCollections(p, buildLibrary(p));
const col = (k: string) => cols.find((c) => c.key === k)!;

describe('collections from the Sheet mappings', () => {
  it('keeps local, language and pairing boundaries; Coffee and Ideas are renamed labels only', () => {
    expect(cols.map((c) => c.name)).toEqual(['Coffee', 'Subscriptions', 'New York Cafés', 'Danish Cafés', 'Café visits in brand Search', 'Brand stories', 'Ideas and unassigned', 'Christmas', 'Advent calendar']);
    expect(col('online-coffee').sourceIds).toEqual(['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08']);
    expect(col('new-york-cafes').sourceIds).toContain('G21');
    expect(col('danish-cafes').sourceIds).not.toContain('G21');
    expect(col('brand-stories').groups.filter((g) => g.campaign === 'US_SNO_Branded').map((g) => g.sourceIds.length)).toEqual([2, 3, 3, 3, 3, 3]);
    expect(col('not-yet-assigned').sourceIds).toEqual(['G43', 'G44', 'G45', 'G46', 'G47', 'G48']);
  });
});

describe('existing data survives the migration', () => {
  it.skipIf(onPostgres)('keeps “Seasonal Coffee from Mexico”, its translation, feedback, comments and history', async () => {
    const dir = tmpDir();
    copyFileSync(path.join(__dirname, 'fixtures', 'legacy-v1.db'), path.join(dir, 'studio.db'));
    const { studio } = (await makeStudio({ dir }));
    expect(readdirSync(path.join(dir, 'backups')).some((f) => f.startsWith('before-migration-v2'))).toBe(true);
    const v = await workspaceView(studio);
    const mexico = v.suggestions.filter((s) => s.sourceId === 'NEW-001');
    expect(mexico.map((s) => [s.language, s.proposedText, s.state])).toEqual(expect.arrayContaining([['EN', 'Seasonal Coffee from Mexico', 'draft'], ['DK', 'Sæsonkaffe fra Mexico', 'draft']]));
    expect(mexico.every((s) => s.collection === 'online-coffee')).toBe(true);
    expect(v.comments.map((c) => [c.language, c.text])).toEqual(expect.arrayContaining([['EN', 'Nice origin story'], ['DK', 'Sæson gentages'], ['EN', 'Check brightness wording']]));
    expect(v.feedback.filter((f: any) => f.verdict === 'needs_changes').map((f: any) => f.language).sort()).toEqual(['DK', 'EN']);
    const legacy = v.suggestions.find((s) => s.sourceId === 'G49')!;
    expect(legacy.needsIntendedUse).toBe(true); // kept, clearly marked — not guessed or discarded
    expect((await studio.repo.events(mexico[0].id)).length).toBeGreaterThan(0);
  });
});

describe('draft → ready for review → approve', () => {
  it('autosaved drafts cannot be approved; Ready for review is a deliberate step', async () => {
    const { studio, sandbox } = (await makeStudio());
    const s = await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coff' }, writer);
    await expect(accept(studio, s.revision!.id, approver)).rejects.toThrow(/Ready for review/);
    await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    await markReady(studio, s.revision!.id, writer);
    // Editing after Ready returns it to draft.
    await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffee' }, writer);
    expect((await studio.mustRevision(s.revision!.id)).state).toBe('draft');
    expect((await studio.mustRevision(s.revision!.id)).readyAt).toBeNull();
    await markReady(studio, s.revision!.id, writer);
    const res: any = await accept(studio, s.revision!.id, approver);
    expect(res.ok).toBe(true);
    expect(sandbox.writeLog).toHaveLength(1); // practice copy
  });

  it('uses accurate action labels per mode, and snapshot approval never claims a Sheet write', async () => {
    const { studio } = (await makeStudio());
    expect(approveMeaning(studio).label).toBe('Accept into practice copy');
    (await studio.setMode('snapshot'));
    expect(approveMeaning(studio).label).toBe('Approve locally');
    expect(approveMeaning(studio, { kind: 'variation', language: 'EN' }).label).toBe('Approve new copy locally');
    const s = await saveEdit(studio, { sourceId: 'G04', language: 'EN', text: 'Coffees with a sense of origin' }, writer);
    await markReady(studio, s.revision!.id, writer);
    const res: any = await accept(studio, s.revision!.id, approver);
    expect(res.message).toMatch(/Approved locally. The Sheet is not changed/);
    expect((await studio.mustRevision(s.revision!.id)).state).toBe('approved');
  });

  it('live mode cannot be selected until a real read succeeds, and live writes stay off', async () => {
    const { repo } = (await makeStudio());
    const broken = { mode: 'google' as const, canWrite: false, describe: () => 'Live', readWorkbook: async () => { throw new SheetError('auth_required', 'Not signed in'); }, readCells: async () => [], writeCells: async () => {} };
    const s = new Studio(repo, { google: () => broken, snapshot: () => new SnapshotGateway(seed()) }, 'snapshot');
    await expect(s.switchMode('google')).rejects.toThrow(/isn’t connected yet/);
    expect(s.mode()).toBe('snapshot');
    const ok = { ...broken, readWorkbook: async () => seed() };
    const s2 = new Studio(repo, { google: () => ok, snapshot: () => new SnapshotGateway(seed()) }, 'snapshot');
    await s2.switchMode('google');
    expect(approveMeaning(s2).label).toBe('Approve locally'); // writes switched off in this version
  });

  it('a Sheet change after the suggestion is a conflict that can be resolved without losing work', async () => {
    const { studio, sandbox } = (await makeStudio());
    const s = await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    await markReady(studio, s.revision!.id, writer);
    sandbox.simulateExternalEdit("'Source copy'!E7", 'Explore the coffees');
    const res: any = await accept(studio, s.revision!.id, approver);
    expect(res.ok).toBe(false);
    const kept = await keepAgainstCurrent(studio, s.revision!.id, writer);
    expect([kept.baseText, kept.proposedText, kept.state]).toEqual(['Explore the coffees', 'Explore our seasonal coffees', 'draft']);
  });

  it('returned work keeps its wording and note', async () => {
    const { studio } = (await makeStudio());
    const s = await saveEdit(studio, { sourceId: 'G04', language: 'EN', text: 'Coffees with sense of place' }, writer);
    await returnForEditing(studio, s.revision!.id, 'Keep “a”', approver);
    const v = await workspaceView(studio);
    expect(v.suggestions.find((x) => x.id === s.revision!.id)!.returnedNote).toBe('Keep “a”');
  });
});

describe('translations', () => {
  it('new-copy translations cannot be approved before the current English is approved', async () => {
    const { studio } = (await makeStudio());
    const en = await saveNewCopy(studio, { collection: 'online-coffee', assetType: 'Headline', language: 'EN', text: 'Roasted in Copenhagen' }, writer);
    const dk = await saveNewCopy(studio, { sourceId: en.revision!.sourceId, collection: 'online-coffee', assetType: 'Headline', language: 'DK', text: 'Ristet i København' }, writer);
    await markReady(studio, dk.revision!.id, writer);
    await expect(accept(studio, dk.revision!.id, approver)).rejects.toThrow(/Approve the English of this new line first/);
    await markReady(studio, en.revision!.id, writer);
    await accept(studio, en.revision!.id, approver);
    expect((await accept(studio, dk.revision!.id, approver) as any).ok).toBe(true);
  });

  it('English changes invalidate translation approval and send it back to review', async () => {
    const { studio } = (await makeStudio());
    const en = await saveNewCopy(studio, { collection: 'online-coffee', assetType: 'Headline', language: 'EN', text: 'Roasted in Copenhagen' }, writer);
    const id = en.revision!.sourceId;
    const dk = await saveNewCopy(studio, { sourceId: id, collection: 'online-coffee', assetType: 'Headline', language: 'DK', text: 'Ristet i København' }, writer);
    await markReady(studio, en.revision!.id, writer); await accept(studio, en.revision!.id, approver);
    await markReady(studio, dk.revision!.id, writer); await accept(studio, dk.revision!.id, approver);
    await saveNewCopy(studio, { sourceId: id, collection: 'online-coffee', assetType: 'Headline', language: 'EN', text: 'Roasted in Copenhagen daily' }, writer);
    expect((await studio.mustRevision(dk.revision!.id)).state).toBe('changes_requested');
    expect((await studio.checkRevisionApproval(await studio.mustRevision(dk.revision!.id), null)).valid).toBe(false);
  });

  it('existing Sheet translations wait for an English change to be approved', async () => {
    const { studio } = (await makeStudio());
    await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    const dk = await saveEdit(studio, { sourceId: 'G03', language: 'DK', text: 'Udforsk vores sæsonkaffer' }, writer);
    await markReady(studio, dk.revision!.id, writer);
    await expect(accept(studio, dk.revision!.id, approver)).rejects.toThrow(/Approve the English first/);
  });

  it('the Sheet’s 43 translation-approval flags are surfaced in the right fields', async () => {
    const { studio } = (await makeStudio());
    const v = await workspaceView(studio);
    expect(v.workbookStatus.translationApprovalFlags).toBe(43);
    const rows = rowsFor(v.collections.find((c) => c.key === 'online-coffee') as any, v);
    expect(translationApprovalFlag(rows[0], 'DK')).toBe(true);
    expect(translationApprovalFlag(rows[0], 'EN')).toBe(false);
  });

  it('a new language starts empty and stays local only', async () => {
    const { studio } = (await makeStudio());
    (await studio.repo.addLanguage('SV', 'Swedish', 'sv-SE'));
    const v = await workspaceView(studio);
    expect(v.languages.find((l) => l.code === 'SV')).toMatchObject({ canonical: false });
    expect(rowsFor(v.collections[0] as any, v)[0].sheet.SV).toBeUndefined();
    const s = await saveEdit(studio, { sourceId: 'G01', language: 'SV', text: 'Kaffe i säsong' }, writer);
    await markReady(studio, s.revision!.id, writer);
    const res: any = await accept(studio, s.revision!.id, approver);
    expect(res.revision.syncState).toBe('local_only');
  });
});

describe('home collection vs intended use', () => {
  it('new copy is organised in its collection but previews only where it is intended (or as a labelled candidate)', async () => {
    const { studio } = (await makeStudio());
    const n = await saveNewCopy(studio, { collection: 'online-coffee', assetType: 'Headline', language: 'EN', text: 'Seasonal Coffee from Mexico' }, writer);
    const id = n.revision!.sourceId;
    let v = await workspaceView(studio);
    const coffee = v.collections.find((c) => c.key === 'online-coffee') as any;
    let rows = rowsFor(coffee, v);
    expect(rows.find((r) => r.sourceId === id)!.home).toBe('online-coffee');
    let pv = collectionCombos(coffee, rows, 'EN', 'pmax', {}, v.intendedUses as any, new Set());
    expect(pv.combos.some((c) => c.slots.some((s) => s.sourceId === id))).toBe(false);
    pv = collectionCombos(coffee, rows, 'EN', 'pmax', {}, v.intendedUses as any, new Set([id]));
    expect(pv.candidateIds.has(id)).toBe(true);
    (await studio.repo.addIntendedUse({ sourceId: id, collection: 'online-coffee', field: 'Headline', format: 'pmax', campaign: null, group: null, createdBy: 'x' }));
    v = await workspaceView(studio);
    rows = rowsFor(coffee, v);
    pv = collectionCombos(coffee, rows, 'EN', 'pmax', {}, v.intendedUses as any, new Set());
    expect(pv.combos.some((c) => c.slots.some((s) => s.sourceId === id))).toBe(true);
    expect(pv.candidateIds.has(id)).toBe(false);
    // Search was not intended → still not there; nothing was mapped.
    expect(collectionCombos(coffee, rows, 'EN', 'search', {}, v.intendedUses as any, new Set()).combos.some((c) => c.slots.some((s) => s.sourceId === id))).toBe(false);
    expect(coffee.groups.every((g: any) => !g.sourceIds.includes(id))).toBe(true);
  });

  it('new collections stay local and unmapped; renaming Coffee changes the label only; briefs persist', async () => {
    const { studio, dir, repo } = (await makeStudio());
    (await repo.saveCollectionMeta({ key: 'local-mexico', name: 'Mexico origin', description: 'Single-origin story', imageNote: 'Warm light, farm', formats: ['pmax'], languages: ['EN'], details: {}, isLocal: true }, 'x'));
    (await repo.saveCollectionMeta({ key: 'online-coffee', name: 'Coffee online' }, 'x'));
    await repo.sql.close();
    const again = (await makeStudio({ dir }));
    const v = await workspaceView(again.studio);
    const local = v.collections.find((c) => c.key === 'local-mexico')!;
    expect([local.isLocal, local.groups.length, local.description, local.imageNote]).toEqual([true, 0, 'Single-origin story', 'Warm light, farm']);
    const coffee = v.collections.find((c) => c.key === 'online-coffee')!;
    expect(coffee.name).toBe('Coffee online');
    expect(coffee.sourceIds).toEqual(col('online-coffee').sourceIds);
    expect(coffee.groups.map((g) => g.campaign)).toEqual(col('online-coffee').groups.map((g) => g.campaign));
    void studio;
  });

  it('ideas need “Use in collection…” with a real field', async () => {
    const { studio } = (await makeStudio());
    await expect(useIdea(studio, { sourceId: 'G43', collection: 'online-coffee', field: 'Short introduction', mode: 'copy' }, writer)).rejects.toThrow(/Headline, Long headline or Description/);
    const r = await useIdea(studio, { sourceId: 'G43', collection: 'online-coffee', field: 'Description', mode: 'copy', format: 'pmax' }, writer);
    expect(r.linked).toBe(false);
    const v = await workspaceView(studio);
    expect(v.suggestions.find((s) => s.sourceId === r.sourceId)!.meta.assetType).toBe('Description');
    await expect(saveNewCopy(studio, { collection: 'online-coffee', assetType: 'Short introduction', language: 'EN', text: 'x y z' }, writer)).rejects.toThrow(/not a Google Ads text field/);
  });
});

describe('formats and readiness', () => {
  it('long headlines and format-specific limits; Demand Gen rules warn, not block', () => {
    expect(validateText('x'.repeat(45), 'Headline', ['demand_gen']).map((v) => v.level)).toEqual(['warning']);
    expect(validateText('x'.repeat(35), 'Headline', ['pmax']).map((v) => v.level)).toEqual(['error']);
    expect(validateText('x'.repeat(91), 'Long headline', ['pmax']).map((v) => v.level)).toEqual(['error']);
    expect(validateText('x'.repeat(80), 'Long headline', ['pmax'])).toEqual([]);
  });

  it('shows the seven Performance Max tabs that miss a long headline', async () => {
    const { studio } = (await makeStudio());
    const v = await workspaceView(studio);
    expect(v.workbookStatus.pmaxTabsMissingLongHeadline).toHaveLength(7);
    const coffee = v.collections.find((c) => c.key === 'online-coffee')!;
    const r = readinessFor('pmax', [{ sourceId: 'G01', field: 'Headline', text: 'Coffees in season', translationApprovalNeeded: false, needsReview: false }], { destinationConfirmed: coffee.destinationConfirmed, workbookGaps: coffee.workbookGaps });
    expect(r.missing).toEqual(expect.arrayContaining(['2 more headlines', '1 more long headline', '2 more descriptions']));
    expect(r.workbookNotes[0]).toMatch(/5 Performance Max tab/);
    expect(r.destinationMissing).toBe(true);
  });
});

describe('pairings', () => {
  it('editing a paired headline keeps its descriptions, and the write keeps the Sheet links in step', async () => {
    const { studio } = (await makeStudio());
    const v = await workspaceView(studio);
    const brand = v.collections.find((c) => c.key === 'brand-stories') as any;
    const rows = rowsFor(brand, v);
    const edits = { 'G28|EN': 'Roasted to reveal' };
    const pv = collectionCombos(brand, rows, 'EN', 'search', edits, [], new Set());
    const withG28 = pv.combos.filter((c) => c.slots.some((s) => s.sourceId === 'G28'));
    expect(withG28.length).toBe(2);
    expect(withG28.every((c) => c.slots[0].text === 'Roasted to reveal' && ['G35', 'G36'].includes(c.slots[1].sourceId))).toBe(true);
    const plan = planReplacement(parseWorkbook(seed()), { sourceId: 'G28', language: 'EN', baseText: 'Roast to reveal', proposedText: 'Roasted to reveal', englishBasis: 'Roasted to reveal' });
    expect(plan.cells.filter((c) => /Keep G3[56] paired/.test(c.purpose)).length).toBe(2);
  });
});

describe('sharing', () => {
  it('shows every affected use and a separate version starts with empty translations', async () => {
    const { studio } = (await makeStudio());
    const v = await workspaceView(studio);
    const impact = impactOf(v, 'G18', 'EN');
    expect(impact.groups.length).toBe(4); // NY_PMX_Local + three brand Search tabs, inside two collections
    expect(impact.summary).toMatch(/Affects 4 ad groups across 4 markets/);
    const sep = await separateVersion(studio, { sourceId: 'G18', collection: 'new-york-cafes' }, writer);
    const v2 = await workspaceView(studio);
    expect(v2.suggestions.filter((s) => s.sourceId === sep.sourceId).map((s) => s.language)).toEqual(['EN']);
    const ny = rowsFor(v2.collections.find((c) => c.key === 'new-york-cafes') as any, v2).find((r) => r.sourceId === sep.sourceId)!;
    expect(ny.sheet.DK).toBeUndefined();
    expect(ny.separatedFrom).toBe('G18');
  });
});

describe('feedback', () => {
  const combo = (lang: string, h: string, d: string) => ({ key: `pmax|x|g|${lang}|H1=G01|D1=G05`, campaign: 'US_PMX_NCA', group: '1. Coffee', format: 'pmax', language: lang, slots: [{ slot: 'H1', sourceId: 'G01', text: h }, { slot: 'D1', sourceId: 'G05', text: d }] });
  it('verdicts switch and clear; resolved and history do not count as active', async () => {
    const { studio } = (await makeStudio());
    const c = combo('EN', 'Coffees in season', 'Sourced…');
    (await setVerdict(studio, { combo: c, verdict: 'works' }, approver));
    (await setVerdict(studio, { combo: c, verdict: 'needs_changes' }, approver));
    let f = feedbackFor(c as any, (await studio.repo.listFeedback()) as any, []);
    expect(f.active!.verdict).toBe('needs_changes');
    expect(f.history.length).toBe(1);
    (await setVerdict(studio, { combo: c, verdict: 'needs_changes' }, approver)); // same again → cleared
    f = feedbackFor(c as any, (await studio.repo.listFeedback()) as any, []);
    expect(f.active).toBeNull();
    (await setVerdict(studio, { combo: c, verdict: 'works' }, approver));
    const id = feedbackFor(c as any, (await studio.repo.listFeedback()) as any, []).active!.id;
    (await studio.repo.resolveFeedback(id, 'done'));
    expect(feedbackFor(c as any, (await studio.repo.listFeedback()) as any, []).active).toBeNull();
  });

  it('combination-level feedback does not flag every line; Danish never shows as English', async () => {
    const { studio } = (await makeStudio());
    const dk = combo('DK', 'Kaffe i sæson', 'Indkøbt…');
    (await setVerdict(studio, { combo: dk, verdict: 'needs_changes' }, approver));
    expect(lineNeedsWork('G01', 'DK', 'Kaffe i sæson', (await studio.repo.listFeedback()) as any)).toBe(false);
    (await setVerdict(studio, { combo: dk, verdict: 'needs_changes', scope: { kind: 'lines', lines: [{ sourceId: 'G01', slot: 'H1' }] } }, approver));
    expect(lineNeedsWork('G01', 'DK', 'Kaffe i sæson', (await studio.repo.listFeedback()) as any)).toBe(true);
    expect(lineNeedsWork('G05', 'DK', 'Indkøbt…', (await studio.repo.listFeedback()) as any)).toBe(false);
    expect(lineNeedsWork('G01', 'EN', 'Coffees in season', (await studio.repo.listFeedback()) as any)).toBe(false);
    expect(feedbackFor(combo('EN', 'Coffees in season', 'Sourced…') as any, (await studio.repo.listFeedback()) as any, []).active).toBeNull();
  });

  it('comments can be edited, deleted and resolved independently of verdicts', async () => {
    const { studio } = (await makeStudio());
    const c = combo('EN', 'Coffees in season', 'Sourced…');
    const { id } = (await addComment(studio, { combo: c, text: 'Season twice' }, approver));
    (await studio.repo.editComment(id, 'Season appears twice'));
    let f = feedbackFor(c as any, [], (await studio.repo.comments()) as any);
    expect(f.comments.map((x) => x.text)).toEqual(['Season appears twice']);
    (await studio.repo.resolveComment(id, true));
    f = feedbackFor(c as any, [], (await studio.repo.comments()) as any);
    expect([f.comments.length, f.resolvedComments.length]).toEqual([0, 1]);
    (await studio.repo.deleteComment(id));
    f = feedbackFor(c as any, [], (await studio.repo.comments()) as any);
    expect([f.comments.length, f.resolvedComments.length]).toEqual([0, 0]);
    expect(f.active).toBeNull();
  });
});

describe('handoff lifecycle', () => {
  it('applied work leaves the actionable list immediately; old unapplied work never disappears', async () => {
    const { studio } = (await makeStudio());
    const s = await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    await markReady(studio, s.revision!.id, writer); await accept(studio, s.revision!.id, approver);
    await studio.repo.sql.all("UPDATE revisions SET updated_at = '2025-01-01T00:00:00Z' WHERE id = ?", [s.revision!.id]); // very old
    let v = await workspaceView(studio);
    let todo = handoffItems(v);
    expect(todo.map((t) => [t.todo, t.old, t.new])).toEqual([['Replace', 'Explore our coffees', 'Explore our seasonal coffees']]);
    expect(todo[0].whereText).toMatch(/Affects 6 ad groups across 3 markets/);
    await studio.markApplied(s.revision!.id, approver);
    v = await workspaceView(studio);
    expect(handoffItems(v)).toEqual([]);
    expect(stageOf(v.suggestions.find((x) => x.id === s.revision!.id)! as any)).toBe('applied');
  });

  it('approved new copy can be registered and then closes', async () => {
    const { studio } = (await makeStudio());
    const n = await saveNewCopy(studio, { collection: 'online-coffee', assetType: 'Long headline', language: 'EN', text: 'Seasonal coffees sourced from producers we know, roasted in Copenhagen' }, writer);
    await markReady(studio, n.revision!.id, writer); await accept(studio, n.revision!.id, approver);
    expect(handoffItems(await workspaceView(studio)).map((t) => t.todo)).toEqual(['Add new copy']);
    await studio.markApplied(n.revision!.id, approver);
    expect(handoffItems(await workspaceView(studio))).toEqual([]);
  });

  it('suggestions survive a restart and do not change the Sheet', async () => {
    const first = (await makeStudio());
    await saveEdit(first.studio, { sourceId: 'G02', language: 'EN', text: 'Rare and bright coffees' }, writer);
    await first.repo.sql.close();
    const second = (await makeStudio({ dir: first.dir }));
    expect((await openSuggestion(second.studio, 'G02', 'EN'))!.proposedText).toBe('Rare and bright coffees');
    expect(second.sandbox.writeLog).toHaveLength(0);
  });
});

// Unused imports guard (keeps the test file honest about what it covers).
void Repo; void openDb; void mkdirSync;
