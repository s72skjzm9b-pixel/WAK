// Reproduces the live workbook layout used for the real-Sheet integration test on 16 Nov 2026:
// a TEST01 item on Source copy row 53 / Translation review row 53, and three Change reference rows
// inserted at 146–148 (inside the Updates for Anabelle FILTER range, which Google expanded to row 151).
import { describe, it, expect } from 'vitest';
import { makeStudio, writer, approver } from './helpers';
import { parseWorkbook } from '@/server/workbook/parse';
import { planReplacement } from '@/server/domain/writeplan';
import { buildHandover } from '@/server/domain/handover';

function addTestItem(sb: any) {
  sb.insertRows('Change reference', 146, 3);
  const w = (ref: string, v: string) => sb.simulateExternalEdit(ref, v);
  w("'Source copy'!A53", 'TEST01'); w("'Source copy'!B53", 'TEST — studio integration test (do not use)'); w("'Source copy'!C53", 'Headline'); w("'Source copy'!E53", 'Studio test line');
  w("'Translation review'!A53", 'TEST01'); w("'Translation review'!D53", 'Testlinje'); w("'Translation review'!F53", 'Testzeile');
  for (const [r, l, prev] of [[146, 'EN', 'Studio test line'], [147, 'DK', 'Testlinje'], [148, 'DE', 'Testzeile']] as const) {
    w(`'Change reference'!A${r}`, 'TEST01'); w(`'Change reference'!B${r}`, l); w(`'Change reference'!C${r}`, prev); w(`'Change reference'!E${r}`, 'Studio test line');
  }
}

describe('live layout with the TEST01 item', () => {
  it('plans exactly Source copy E53 and Change reference I146/J146', async () => {
    const { sandbox } = (await makeStudio());
    addTestItem(sandbox);
    const p = parseWorkbook(await sandbox.readWorkbook());
    const plan = planReplacement(p, { sourceId: 'TEST01', language: 'EN', baseText: 'Studio test line', proposedText: 'Studio test line — revised', englishBasis: 'Studio test line — revised' });
    expect(plan.blockers).toEqual([]);
    expect(plan.cells.map((c) => [c.ref, c.after])).toEqual([
      ["'Source copy'!E53", 'Studio test line — revised'],
      ["'Change reference'!I146", 'Studio test line — revised'],
      ["'Change reference'!J146", 'Studio test line — revised'],
    ]);
    expect(plan.predictions.map((x) => `${x.lang}:${x.action}`)).toEqual(['EN:Approved — apply / acknowledge', 'DK:Needs approval', 'DE:Needs approval']);
  });

  it('the test item is never exported even when approved and written', async () => {
    const { studio, sandbox } = (await makeStudio());
    addTestItem(sandbox);
    await studio.refresh();
    const r = await studio.createRevision({ kind: 'replace', sourceId: 'TEST01', language: 'EN', proposedText: 'Studio test line — revised' }, writer);
    expect(r.isTest).toBe(true);
    await studio.submit(r.id, writer);
    // Test item has no campaign usage, so no character limit applies; approval + write still work.
    const res = await studio.approve(r.id, approver, { updateSheet: false });
    expect(res.ok).toBe(true);
    const h = await buildHandover(studio, {});
    expect(JSON.stringify([h.approved, h.replacements, h.variations])).not.toContain('TEST01');
  });
});
