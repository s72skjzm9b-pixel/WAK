import { describe, it, expect } from 'vitest';
import { parseWorkbook } from '@/server/workbook/parse';
import { buildLibrary } from '@/server/domain/library';
import { seed } from './helpers';

describe('workbook discovery (real copy snapshot)', () => {
  const p = parseWorkbook(seed());

  it('finds all named tabs and verifies the documented column mapping by header', () => {
    expect(p.missingTabs).toEqual([]);
    const bad = p.mappingChecks.filter((c) => !c.ok);
    expect(bad).toEqual([]);
    expect(p.sourceCols.english.letter).toBe('E');
    expect(p.translationCols.dk.letter).toBe('D');
    expect(p.translationCols.de.letter).toBe('F');
    expect(p.changeRefCols.approvedReplacement.letter).toBe('I');
  });

  it('reads G01–G48 with real wording and keeps G48 as a proposed line', () => {
    expect(p.source.map((s) => s.sourceId)).toEqual(Array.from({ length: 48 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`));
    expect(p.source[0].english).toBe('Coffees in season');
    const g48 = p.source.find((s) => s.sourceId === 'G48')!;
    expect(g48.english).toBe('La Cabra');
    expect(g48.status).toMatch(/needs approval/i);
  });

  it('reads change tracking, campaign tabs and memberships without relying on tab order', () => {
    expect(p.changeRef).toHaveLength(144);
    expect(p.updatesRows).toHaveLength(0);
    expect(p.updatesEmptyMessage).toMatch(/No changes/);
    expect(p.campaigns.map((c) => c.name).sort()).toHaveLength(13);
    const dkLocal = p.campaigns.find((c) => c.name === 'DK_PMX_Local')!;
    expect(dkLocal.language).toBe('DK');
    expect(dkLocal.format).toBe('pmax');
    expect(dkLocal.memberships.map((m) => m.sourceId)).not.toContain('G21'); // NY-only line excluded in Denmark
    expect(dkLocal.alternatives.length).toBeGreaterThan(0);
    expect(dkLocal.gaps.some((g) => /long headline/i.test(g.assetType))).toBe(true);
  });

  it('derives intents from the source, not from location alone', () => {
    const lib = buildLibrary(p);
    const g21 = lib.find((i) => i.sourceId === 'G21')!;
    expect(g21.intents).toContain('ny_cafe');
    const g01 = lib.find((i) => i.sourceId === 'G01')!;
    expect(g01.intents).toEqual(['online']);
    expect(g01.usages.some((u) => u.campaign === 'DK_PMX_NCA')).toBe(true);
    const g18 = lib.find((i) => i.sourceId === 'G18')!;
    expect(g18.intents).toEqual(expect.arrayContaining(['local_cafe', 'dk_cafe']));
  });
});
