import { describe, it, expect } from 'vitest';
import { makeStudio, writer, approver } from './helpers';
import { buildCollections } from '@/server/domain/collections';
import { parseWorkbook } from '@/server/workbook/parse';
import { buildLibrary } from '@/server/domain/library';
import { saveEdit, saveNewCopy, accept, returnForEditing, keepAgainstCurrent, openSuggestion } from '@/server/domain/suggestions';
import { workspaceView } from '@/server/domain/workspace';
import { seed } from './helpers';

const p = parseWorkbook(seed());
const cols = buildCollections(p, buildLibrary(p));
const col = (k: string) => cols.find((c) => c.key === k)!;

describe('collections from the Sheet mappings', () => {
  it('keeps local, language and pairing boundaries', () => {
    expect(cols.map((c) => c.name)).toEqual(['Online Coffee', 'Subscriptions', 'New York Cafés', 'Danish Cafés', 'Café visits in brand Search', 'Brand stories', 'Not yet assigned', 'Christmas', 'Advent calendar']);
    expect(col('online-coffee').sourceIds).toEqual(['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08']);
    expect(col('online-coffee').languages).toEqual(['EN', 'DK', 'DE']);
    expect(col('new-york-cafes').sourceIds).toContain('G21');
    expect(col('new-york-cafes').languages).toEqual(['EN']);
    expect(col('danish-cafes').sourceIds).not.toContain('G21');
    expect(col('danish-cafes').languages).toEqual(['DK']);
    expect(col('cafe-search').sourceIds).not.toContain('G21');
    expect(col('brand-stories').pairing).toBe(true);
    // Brand pairs stay separate groups (one headline with its own descriptions).
    expect(col('brand-stories').groups.filter((g) => g.campaign === 'US_SNO_Branded').map((g) => g.sourceIds.length)).toEqual([2, 3, 3, 3, 3, 3]); // “Born in Aarhus” has one linked description
    expect(col('not-yet-assigned').sourceIds).toEqual(['G43', 'G44', 'G45', 'G46', 'G47', 'G48']); // incl. “La Cabra”, not added anywhere
    expect(col('christmas').sourceIds).toEqual([]);
    expect(col('online-coffee').destinationConfirmed).toBe(false);
  });
});

describe('direct editing', () => {
  it('autosaves a suggestion, never writes the Sheet, and reverting restores the original', async () => {
    const { studio, sandbox } = makeStudio();
    const a = await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    expect(a.status).toBe('saved');
    await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffee' }, writer);
    expect(studio.repo.listRevisions({ sourceId: 'G03' }).filter((r) => r.state !== 'withdrawn')).toHaveLength(1); // one suggestion, updated
    expect(sandbox.writeLog).toHaveLength(0);
    const b = await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our coffees' }, writer);
    expect(b.status).toBe('reverted');
    expect(openSuggestion(studio, 'G03', 'EN')).toBeNull();
  });

  it('translations follow the suggested English and keep their own wording', async () => {
    const { studio } = makeStudio();
    await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    const dk = await saveEdit(studio, { sourceId: 'G03', language: 'DK', text: 'Udforsk vores sæsonkaffer' }, writer);
    expect(dk.revision!.englishBasis).toBe('Explore our seasonal coffees');
    // English changes again: the Danish keeps its text and its old basis (so it shows as needing review).
    await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore seasonal coffees' }, writer);
    const dkNow = openSuggestion(studio, 'G03', 'DK')!;
    expect(dkNow.proposedText).toBe('Udforsk vores sæsonkaffer');
    expect(dkNow.englishBasis).not.toBe('Explore seasonal coffees');
    // Accepting the translation before the English is refused with a clear message.
    await expect(accept(studio, dkNow.id, approver)).rejects.toThrow(/Accept the English first/);
  });

  it('accepting writes to the Sheet and Anabelle can see old → new', async () => {
    const { studio, sandbox } = makeStudio();
    const s = await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    const res = await accept(studio, s.revision!.id, approver);
    expect(res.ok).toBe(true);
    expect(studio.mustRevision(s.revision!.id).state).toBe('written');
    expect(sandbox.writeLog).toHaveLength(1);
  });

  it('a Sheet change after the suggestion is a conflict that can be resolved without losing the suggestion', async () => {
    const { studio, sandbox } = makeStudio();
    const s = await saveEdit(studio, { sourceId: 'G03', language: 'EN', text: 'Explore our seasonal coffees' }, writer);
    sandbox.simulateExternalEdit("'Source copy'!E7", 'Explore the coffees');
    const res: any = await accept(studio, s.revision!.id, approver);
    expect(res.ok).toBe(false);
    expect(studio.mustRevision(s.revision!.id).syncState).toBe('conflict');
    const kept = await keepAgainstCurrent(studio, s.revision!.id, writer);
    expect(kept.baseText).toBe('Explore the coffees');
    expect(kept.proposedText).toBe('Explore our seasonal coffees');
    const again: any = await accept(studio, s.revision!.id, approver);
    expect(again.ok).toBe(true);
  });

  it('return for editing keeps the wording and the note', async () => {
    const { studio } = makeStudio();
    const s = await saveEdit(studio, { sourceId: 'G04', language: 'EN', text: 'Coffees with sense of place' }, writer);
    await returnForEditing(studio, s.revision!.id, 'Keep “a”', approver);
    const v = await workspaceView(studio);
    const sug = v.suggestions.find((x) => x.id === s.revision!.id)!;
    expect(sug.state).toBe('changes_requested');
    expect(sug.returnedNote).toBe('Keep “a”');
    expect(sug.proposedText).toBe('Coffees with sense of place');
  });
});

describe('adding copy', () => {
  it('new copy gets its own ID and empty translations, and duplicates are refused', async () => {
    const { studio } = makeStudio();
    const n = await saveNewCopy(studio, { collection: 'online-coffee', assetType: 'Headline', language: 'EN', text: 'Roasted in Copenhagen' }, writer);
    const id = n.revision!.sourceId;
    expect(id).toBe('NEW-001');
    expect(openSuggestion(studio, id, 'DK', 'variation')).toBeNull(); // no inherited translations
    await expect(saveNewCopy(studio, { collection: 'online-coffee', assetType: 'Headline', language: 'EN', text: 'coffees in season' }, writer)).rejects.toThrow(/Identical copy already exists \(G01\)/);
    const dk = await saveNewCopy(studio, { sourceId: id, collection: 'online-coffee', assetType: 'Headline', language: 'DK', text: 'Ristet i København' }, writer);
    expect(dk.revision!.englishBasis).toBe('Roasted in Copenhagen');
    const v = await workspaceView(studio);
    expect(v.suggestions.filter((x) => x.sourceId === id).map((x) => x.collection)).toEqual(['online-coffee', 'online-coffee']);
  });

  it('legacy variation drafts land in the collection of their old targets', async () => {
    const { studio } = makeStudio();
    const legacy = await studio.createRevision({ kind: 'variation', language: 'EN', proposedText: 'Roasted in Copenhagen', meta: { assetType: 'Headline', targets: [{ campaign: 'US_PMX_NCA', group: '1. Coffee' }] } }, writer);
    const v = await workspaceView(studio);
    expect(v.suggestions.find((x) => x.id === legacy.id)!.collection).toBe('online-coffee');
  });
});

describe('connection unavailable', () => {
  it('keeps the workspace and suggestions usable, and does not claim a Sheet update', async () => {
    const { studio, repo } = makeStudio();
    const { Studio } = await import('@/server/domain/studio');
    const { SnapshotGateway } = await import('@/server/sheets/snapshot');
    const { SheetError } = await import('@/server/sheets/gateway');
    const broken = { mode: 'google' as const, canWrite: true, describe: () => 'Live Google Sheet',
      readWorkbook: async () => { throw new SheetError('auth_required', 'Not signed in'); }, readCells: async () => [], writeCells: async () => {} };
    const live = new Studio(repo, { google: () => broken, snapshot: () => new SnapshotGateway(seed()) }, 'google');
    void studio;
    const v = await workspaceView(live);
    expect(v.collections.length).toBeGreaterThan(5);
    const s = await saveEdit(live, { sourceId: 'G04', language: 'EN', text: 'Coffees with a sense of origin' }, writer);
    const res: any = await accept(live, s.revision!.id, approver);
    expect(res.ok).toBe(false);
    expect(live.mustRevision(s.revision!.id).state).toBe('approved'); // accepted, kept
    expect(live.mustRevision(s.revision!.id).syncState).toBe('failed'); // honestly not written
    expect(live.mustRevision(s.revision!.id).proposedText).toBe('Coffees with a sense of origin');
  });
});
