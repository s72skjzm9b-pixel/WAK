import { describe, it, expect } from 'vitest';
import { makeStudio, writer, approver } from './helpers';
import { buildHandover, handoverCsv } from '@/server/domain/handover';
import { generateCombos } from '@/lib/combos';

describe('handover eligibility', () => {
  it('excludes drafts, submitted and invalidated wording; includes only exact approvals', async () => {
    const { studio } = makeStudio();
    const draft = await studio.createRevision({ kind: 'replace', sourceId: 'G01', language: 'EN', proposedText: 'Coffees of the season' }, writer);
    const sub = await studio.createRevision({ kind: 'replace', sourceId: 'G02', language: 'EN', proposedText: 'Rare and bright coffees' }, writer);
    await studio.submit(sub.id, writer);
    let h = await buildHandover(studio, { market: 'US' });
    expect(h.approved).toHaveLength(0);
    expect(h.replacements).toHaveLength(0);
    expect(h.excluded.drafts).toBe(2);

    await studio.approveAsIs('G04', 'EN', approver);
    h = await buildHandover(studio, { campaign: 'US_PMX_NCA' });
    expect(h.approved.map((a) => a.sourceId)).toEqual(['G04']);
    const csv = handoverCsv(h, 'batch_test');
    expect(csv.csv).toContain('Review/handover CSV — not validated for Google Ads Editor import');
    expect(csv.csv).not.toContain('Coffees of the season');
    expect(csv.csv).not.toContain('Rare and bright coffees');
    void draft;
  });

  it('lists written replacements with exact previous and replacement text until the reference is advanced', async () => {
    const { studio } = makeStudio();
    const r = await studio.createRevision({ kind: 'replace', sourceId: 'G03', language: 'EN', proposedText: 'Explore our seasonal coffees' }, writer);
    await studio.submit(r.id, writer);
    await studio.approve(r.id, approver, { updateSheet: true });
    const h = await buildHandover(studio, { market: 'US', language: 'EN' });
    expect(h.replacements).toHaveLength(1);
    expect(h.replacements[0]).toMatchObject({ previousText: 'Explore our coffees', replacementText: 'Explore our seasonal coffees' });
    expect(h.replacements[0].usages.map((u) => u.campaign)).toEqual(expect.arrayContaining(['US_PMX_Evergreen', 'US_SNO_Branded']));
    expect(h.updatesInSheet.some((u) => u.sourceId === 'G03')).toBe(true);
    // Translations of G03 depend on re-review now.
    const all = await buildHandover(studio, {});
    expect(all.dependencies.some((d) => d.kind === 'translation_recheck' && d.sourceId === 'G03')).toBe(true);
  });

  it('shows seasonal gaps instead of inventing copy', async () => {
    const { studio } = makeStudio();
    const h = await buildHandover(studio, {});
    expect(h.dependencies.some((d) => d.kind === 'seasonal_gap' && /Christmas/.test(d.campaign ?? ''))).toBe(true);
    expect(h.dependencies.some((d) => d.kind === 'seasonal_gap' && /Advent/.test(d.campaign ?? ''))).toBe(true);
  });

  it('never includes test items', async () => {
    const { studio, sandbox } = makeStudio();
    sandbox.simulateExternalEdit("'Source copy'!A53", 'TEST01');
    sandbox.simulateExternalEdit("'Source copy'!E53", 'Studio test line — do not use');
    sandbox.simulateExternalEdit("'Source copy'!C53", 'Headline');
    await studio.refresh();
    await studio.approveAsIs('TEST01', 'EN', approver);
    const h = await buildHandover(studio, {});
    expect(JSON.stringify(h.approved)).not.toContain('TEST01');
    expect(handoverCsv(h, 'b').csv).not.toContain('Studio test line');
  });
});

describe('combination feedback', () => {
  it('stays attached to the exact wording and shows when it changed', async () => {
    const { studio } = makeStudio();
    const combo = { key: 'k1', campaign: 'US_PMX_NCA', group: '1. Coffee', format: 'pmax', language: 'EN' as const, slots: [
      { slot: 'H1', sourceId: 'G03', text: 'Explore our coffees', state: 'sheet' },
      { slot: 'D1', sourceId: 'G05', text: 'Sourced with the changing seasons, roasted to express their origins.', state: 'sheet' },
    ] };
    await studio.addFeedback({ combo, verdict: 'needs_changes', reasons: ['repetition'], comment: 'Too similar' }, approver);
    expect((await studio.feedback())[0].changedSince).toHaveLength(0);
    const r = await studio.createRevision({ kind: 'replace', sourceId: 'G03', language: 'EN', proposedText: 'Explore our seasonal coffees' }, writer);
    await studio.submit(r.id, writer);
    await studio.approve(r.id, approver, { updateSheet: true });
    const fb = (await studio.feedback())[0];
    expect(fb.changedSince).toEqual([{ slot: 'H1', sourceId: 'G03', then: 'Explore our coffees', now: 'Explore our seasonal coffees' }]);
    // Combination feedback is not copy approval.
    expect(studio.currentWordingApproval((await studio.item('G05'))!, 'EN')).toBeNull();
  });
});

describe('preview combinations', () => {
  const asset = (id: string, type: string, text: string, linked: string | null = null) => ({ sourceId: id, assetType: type, text, linkedHeadline: linked, state: 'sheet' as const });
  const heads = [asset('H1', 'Headline', 'A'), asset('H2', 'Headline', 'B'), asset('H3', 'Headline', 'C'), asset('H4', 'Headline', 'D')];
  const descs = [asset('D1', 'Description', 'x'), asset('D2', 'Description', 'y')];

  it('Search respects a pinning proposal and does not pin anything by default', () => {
    const free = generateCombos({ campaign: 'US_SNO_Branded', group: 'g', format: 'search', language: 'EN', assets: [...heads, ...descs], pins: {} });
    expect(new Set(free.all.map((c) => c.slots[0].sourceId)).size).toBe(4);
    const pinned = generateCombos({ campaign: 'US_SNO_Branded', group: 'g', format: 'search', language: 'EN', assets: [...heads, ...descs], pins: { H4: 'H1' } });
    expect(pinned.all.length).toBeGreaterThan(0);
    expect(pinned.all.every((c) => c.slots[0].sourceId === 'H4')).toBe(true);
    expect(pinned.all.every((c) => c.slots.slice(1).every((s) => s.sourceId !== 'H4'))).toBe(true);
  });

  it('PMax ignores pins and keeps explicit headline–description pairs', () => {
    const linked = asset('D9', 'Description', 'paired', 'B');
    const res = generateCombos({ campaign: 'US_PMX_NCA', group: 'g', format: 'pmax', language: 'EN', assets: [...heads, linked], pins: { H4: 'H1' } });
    expect(res.all.some((c) => c.slots[0].sourceId !== 'H4')).toBe(true);
    expect(res.all.every((c) => c.slots.some((s) => s.text === 'B'))).toBe(true);
  });
});
