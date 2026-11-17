// Behaviour of drafts, approvals and safe write-back against the formula-emulating sandbox.
import { describe, it, expect } from 'vitest';
import { makeStudio, writer, approver, anabelle, literalDiff } from './helpers';
import { planReplacement } from '@/server/domain/writeplan';
import { parseWorkbook } from '@/server/workbook/parse';

async function submittedReplacement(studio: any, sourceId = 'G03', lang: 'EN' | 'DK' | 'DE' = 'EN', text = 'Explore our seasonal coffees') {
  const r = await studio.createRevision({ kind: 'replace', sourceId, language: lang, proposedText: text, reason: 'test' }, writer);
  await studio.submit(r.id, writer);
  return r;
}

describe('drafts never touch the Sheet', () => {
  it('typing and saving a draft performs no writes', async () => {
    const { studio, sandbox } = (await makeStudio());
    const before = await sandbox.readWorkbook();
    const r = await studio.createRevision({ kind: 'replace', sourceId: 'G03', language: 'EN', proposedText: 'Explore our coff' }, writer);
    await studio.editRevision(r.id, { proposedText: 'Explore our coffees today' }, writer);
    await studio.submit(r.id, writer);
    expect(sandbox.writeLog).toHaveLength(0);
    const after = await sandbox.readWorkbook();
    expect(after.tabs['Source copy'].values).toEqual(before.tabs['Source copy'].values);
  });
});

describe('approve and update Sheet', () => {
  it('changes only the intended literal cells and the comparison picks it up', async () => {
    const { studio, sandbox } = (await makeStudio());
    const before = await sandbox.readWorkbook();
    const r = await submittedReplacement(studio);
    const res = await studio.approve(r.id, approver, { updateSheet: true });
    expect(res.ok).toBe(true);
    expect(res.revision.state).toBe('written');
    const after = await sandbox.readWorkbook();
    const diffs = await literalDiff(sandbox, before, after);
    // G03 is on Source copy row 7; its Change reference EN row is 11.
    expect(diffs.sort()).toEqual(["'Change reference'!I11", "'Change reference'!J11", "'Source copy'!E7"].sort());
    const p = parseWorkbook(after);
    const upd = p.updatesRows.find((x) => x.sourceId === 'G03' && x.lang === 'EN')!;
    expect(upd.previous).toBe('Explore our coffees');
    expect(upd.current).toBe('Explore our seasonal coffees');
    expect(upd.action).toBe('Approved — apply / acknowledge');
    // The saved reference was NOT advanced.
    expect(p.changeRef.find((x) => x.sourceId === 'G03' && x.lang === 'EN')!.previous).toBe('Explore our coffees');
    expect(res.message).toMatch(/Updates for Anabelle shows the change/);
  });

  it('English changes flag translations for re-review', async () => {
    const { studio, sandbox } = (await makeStudio());
    const dk = await submittedReplacement(studio, 'G03', 'DK', 'Opdag vores kaffer');
    await studio.approveAsIs('G03', 'DE', approver);
    const en = await submittedReplacement(studio);
    await studio.approve(en.id, approver, { updateSheet: true });
    const p = parseWorkbook(await sandbox.readWorkbook());
    const dkRow = p.changeRef.find((x) => x.sourceId === 'G03' && x.lang === 'DK')!;
    expect(dkRow.translationCheck).toBe('Recheck translation');
    expect(p.updatesRows.some((x) => x.sourceId === 'G03' && x.lang === 'DE')).toBe(true);
    expect(p.translations.find((t) => t.sourceId === 'G03')!.dkStatus).toMatch(/English changed/);
    // The open Danish proposal was sent back, and the German as-is approval no longer counts.
    expect((await studio.mustRevision(dk.id)).state).toBe('changes_requested');
    const item = (await studio.item('G03'))!;
    expect((await studio.currentWordingApproval(item, 'DE'))).toBeNull();
  });

  it('a translation approval covers the English it translates', async () => {
    const { studio } = (await makeStudio());
    const dk = await submittedReplacement(studio, 'G05', 'DK', 'Indkøbt efter sæsonen, ristet for at fremhæve oprindelsen.');
    await studio.approve(dk.id, approver, { updateSheet: false });
    expect((await studio.checkRevisionApproval(await studio.mustRevision(dk.id), await studio.item('G05'))).valid).toBe(true);
    const en = await submittedReplacement(studio, 'G05', 'EN', 'Sourced with the seasons, roasted to express their origins.');
    await studio.approve(en.id, approver, { updateSheet: true });
    expect((await studio.mustRevision(dk.id)).state).toBe('changes_requested');
    expect((await studio.checkRevisionApproval(await studio.mustRevision(dk.id), await studio.item('G05'))).valid).toBe(false);
  });
});

describe('approval is for exact wording', () => {
  it('further edits invalidate the approval and return the proposal to draft', async () => {
    const { studio, sandbox } = (await makeStudio());
    const r = await submittedReplacement(studio);
    await studio.approve(r.id, approver, { updateSheet: false });
    expect((await studio.checkRevisionApproval(await studio.mustRevision(r.id), null)).valid).toBe(true);
    await studio.editRevision(r.id, { proposedText: 'Explore our seasonal coffee' }, writer);
    const after = (await studio.mustRevision(r.id));
    expect(after.state).toBe('draft');
    const chk = (await studio.checkRevisionApproval(after, null));
    expect(chk.valid).toBe(false);
    await expect(studio.writeToSheet(r.id, approver)).rejects.toThrow(/Approve/);
    expect(sandbox.writeLog).toHaveLength(0);
    expect((await studio.repo.events(r.id)).some((e: any) => e.action === 'approval_invalidated')).toBe(true);
  });
});

describe('conflicts, failures and retries', () => {
  it('a concurrent Sheet edit produces a conflict instead of an overwrite', async () => {
    const { studio, sandbox } = (await makeStudio());
    const r = await submittedReplacement(studio);
    sandbox.simulateExternalEdit("'Source copy'!E7", 'Explore the coffees');
    const res = await studio.approve(r.id, approver, { updateSheet: true });
    expect(res.ok).toBe(false);
    expect(res.outcome).toBe('conflict');
    expect(res.revision.syncState).toBe('conflict');
    expect(res.revision.proposedText).toBe('Explore our seasonal coffees'); // draft retained
    const [cell] = await sandbox.readCells(["'Source copy'!E7"]);
    expect(cell.value).toBe('Explore the coffees'); // their edit survives
  });

  it('a failed write keeps the approved draft and can be retried', async () => {
    const { studio, sandbox } = (await makeStudio());
    const r = await submittedReplacement(studio);
    sandbox.faults.failNextWrites = { count: 1, kind: 'permission', message: 'No edit access' };
    const res = await studio.approve(r.id, approver, { updateSheet: true });
    expect(res.ok).toBe(false);
    expect(res.revision.state).toBe('approved');
    expect(res.revision.syncState).toBe('failed');
    expect(res.revision.syncState).not.toBe('written');
    const retry = await studio.writeToSheet(r.id, approver);
    expect(retry.ok).toBe(true);
    expect(retry.revision.state).toBe('written');
  });

  it('retrying after a lost response does not write twice', async () => {
    const { studio, sandbox } = (await makeStudio());
    const r = await submittedReplacement(studio);
    sandbox.faults.failNextWrites = { count: 1, kind: 'network', afterApplying: true };
    const first = await studio.approve(r.id, approver, { updateSheet: true });
    expect(first.ok).toBe(false);
    expect(sandbox.writeLog).toHaveLength(1);
    const retry = await studio.writeToSheet(r.id, approver);
    expect(retry.ok).toBe(true);
    expect(retry.outcome).toBe('already_applied');
    expect(sandbox.writeLog).toHaveLength(1);
    const again = await studio.writeToSheet(r.id, approver);
    expect(again.outcome).toBe('already_written');
    expect(sandbox.writeLog).toHaveLength(1);
  });

  it('resumes a partial write (text landed, approval cells did not) instead of reporting a conflict', async () => {
    const { studio, sandbox } = (await makeStudio());
    const r = await submittedReplacement(studio);
    sandbox.faults.failNextWrites = { count: 1, kind: 'network', partial: true };
    const first = await studio.approve(r.id, approver, { updateSheet: true });
    expect(first.ok).toBe(false);
    let p = parseWorkbook(await sandbox.readWorkbook());
    expect(p.changeRef.find((x) => x.sourceId === 'G03' && x.lang === 'EN')!.action).toBe('Needs approval');
    const retry = await studio.writeToSheet(r.id, approver);
    expect(retry.ok).toBe(true);
    p = parseWorkbook(await sandbox.readWorkbook());
    expect(p.updatesRows.find((x) => x.sourceId === 'G03' && x.lang === 'EN')!.action).toBe('Approved — apply / acknowledge');
  });

  it('a proposal that never wrote still treats an outside edit to its own wording as a conflict', async () => {
    const { studio, sandbox } = (await makeStudio());
    const r = await submittedReplacement(studio);
    sandbox.simulateExternalEdit("'Source copy'!E7", 'Explore our seasonal coffees'); // someone typed the same text by hand
    const res = await studio.approve(r.id, approver, { updateSheet: true });
    // All planned cells do not hold the approved values (I/J empty) and there was no prior attempt → conflict, not overwrite.
    expect(res.ok).toBe(false);
    expect(res.outcome).toBe('conflict');
  });

  it('refuses to write when the Change reference row falls outside the Updates FILTER range', async () => {
    const { studio, sandbox } = (await makeStudio());
    sandbox.insertRows('Change reference', 5, 3); // pushes G48 rows beyond row 148
    await studio.refresh();
    const r = await submittedReplacement(studio, 'G48', 'EN', 'La Cabra Coffee');
    const res = await studio.approve(r.id, approver, { updateSheet: true });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/outside the Updates for Anabelle FILTER range/);
    expect(sandbox.writeLog).toHaveLength(0);
  });

  it('never plans to write formula columns', async () => {
    const { sandbox } = (await makeStudio());
    const p = parseWorkbook(await sandbox.readWorkbook());
    const plan = planReplacement(p, { sourceId: 'G05', language: 'DK', baseText: p.translations[4].dk, proposedText: 'Ny tekst', englishBasis: p.source[4].english });
    const refs = plan.cells.map((c) => c.ref);
    expect(refs).toEqual(["'Translation review'!D9", "'Change reference'!I18", "'Change reference'!J18"]);
    const reads = await sandbox.readCells(refs);
    expect(reads.every((c) => c.formula === null)).toBe(true);
    await expect(sandbox.writeCells([{ ref: "'Translation review'!C9", value: 'x' }])).rejects.toThrow(/formula/);
  });
});

describe('application acknowledgement is separate from approval', () => {
  it('approval leaves the pending update; acknowledgement + explicit advance clears it', async () => {
    const { studio, sandbox } = (await makeStudio());
    const r = await submittedReplacement(studio);
    await studio.approve(r.id, approver, { updateSheet: true });
    let p = parseWorkbook(await sandbox.readWorkbook());
    expect(p.updatesRows.some((x) => x.sourceId === 'G03' && x.lang === 'EN')).toBe(true);

    const ack = await studio.acknowledge({ revisionId: r.id, sourceId: 'G03', language: 'EN', appliedText: 'Explore our seasonal coffees' }, anabelle);
    p = parseWorkbook(await sandbox.readWorkbook());
    expect(p.updatesRows.some((x) => x.sourceId === 'G03' && x.lang === 'EN')).toBe(true); // ack alone writes nothing

    const adv = await studio.advanceReference(ack.id, anabelle);
    expect(adv.ok).toBe(true);
    p = parseWorkbook(await sandbox.readWorkbook());
    const row = p.changeRef.find((x) => x.sourceId === 'G03' && x.lang === 'EN')!;
    expect(row.previous).toBe('Explore our seasonal coffees');
    expect(row.action).toBe('No pending change');
    expect(p.updatesRows.some((x) => x.sourceId === 'G03' && x.lang === 'EN')).toBe(false);
    // Translations still flagged: their English reference was not advanced.
    expect(p.updatesRows.some((x) => x.sourceId === 'G03' && x.lang === 'DK')).toBe(true);
  });
});

describe('persistence', () => {
  it('proposals, approvals and the sandbox survive a restart', async () => {
    const first = (await makeStudio());
    const r = await submittedReplacement(first.studio);
    await first.studio.approve(r.id, approver, { updateSheet: true });
    await first.repo.sql.close();
    const second = (await makeStudio({ dir: first.dir }));
    const again = (await second.studio.mustRevision(r.id));
    expect(again.state).toBe('written');
    expect((await second.repo.events(r.id)).length).toBeGreaterThan(2);
    const [cell] = await second.sandbox.readCells(["'Source copy'!E7"]);
    expect(cell.value).toBe('Explore our seasonal coffees');
  });
});

describe('new variations', () => {
  it('stay local, never replace the existing line and require a new ID', async () => {
    const { studio, sandbox } = (await makeStudio());
    await expect(studio.createRevision({ kind: 'variation', sourceId: 'G03', language: 'EN', proposedText: 'x' }, writer)).rejects.toThrow(/already exists/);
    const v = await studio.createRevision({ kind: 'variation', language: 'EN', proposedText: 'Seasonal coffees, roasted in Copenhagen', meta: { assetType: 'Headline', targets: [{ campaign: 'US_PMX_NCA', group: '1. Coffee' }] } }, writer);
    expect(v.sourceId).toBe('G49');
    await studio.submit(v.id, writer);
    // 39 chars: too long for a 30-character PMax headline → cannot be approved.
    await expect(studio.approve(v.id, approver, { updateSheet: true })).rejects.toThrow(/too long/);
    await studio.editRevision(v.id, { proposedText: 'Roasted in Copenhagen' }, writer);
    await studio.submit(v.id, writer);
    const res = await studio.approve(v.id, approver, { updateSheet: true });
    expect(res.revision.syncState).toBe('local_only');
    expect(sandbox.writeLog).toHaveLength(0);
  });
});
