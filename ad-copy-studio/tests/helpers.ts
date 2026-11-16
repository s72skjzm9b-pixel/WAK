import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '@/server/store/db';
import { Repo } from '@/server/store/repo';
import { Studio, type Actor } from '@/server/domain/studio';
import { SandboxGateway } from '@/server/sheets/sandbox';
import { SnapshotGateway, loadSnapshotFile } from '@/server/sheets/snapshot';
import type { RawWorkbook } from '@/server/workbook/types';

export const writer: Actor = { role: 'Copywriter', name: 'Test writer' };
export const approver: Actor = { role: 'Approver', name: 'Test approver' };
export const anabelle: Actor = { role: 'Ads specialist', name: 'Anabelle' };

export function tmpDir() { return mkdtempSync(path.join(os.tmpdir(), 'studio-test-')); }

export function seed(): RawWorkbook { return loadSnapshotFile(path.join(__dirname, '..', 'seed', 'workbook-snapshot.json')); }

export function makeStudio(opts: { dir?: string; sandbox?: SandboxGateway } = {}) {
  const dir = opts.dir ?? tmpDir();
  const repo = new Repo(openDb(path.join(dir, 'studio.db')));
  const sandbox = opts.sandbox ?? new SandboxGateway(seed(), path.join(dir, 'sandbox.json'));
  const snapshot = new SnapshotGateway(seed());
  const studio = new Studio(repo, { sandbox: () => sandbox, snapshot: () => snapshot }, 'sandbox');
  return { studio, repo, sandbox, dir };
}

/** Literal (non-formula) cells that differ between two workbook reads. */
export async function literalDiff(sb: SandboxGateway, before: RawWorkbook, after: RawWorkbook) {
  const diffs: string[] = [];
  for (const [tab, t] of Object.entries(after.tabs)) {
    const b = before.tabs[tab]?.values ?? [];
    const rows = Math.max(b.length, t.values.length);
    for (let r = 0; r < rows; r++) {
      const cols = Math.max(b[r]?.length ?? 0, t.values[r]?.length ?? 0);
      for (let c = 0; c < cols; c++) {
        const x = b[r]?.[c] ?? '', y = t.values[r]?.[c] ?? '';
        if (x === y) continue;
        let col = '', n = c + 1; while (n > 0) { col = String.fromCharCode(65 + ((n - 1) % 26)) + col; n = Math.floor((n - 1) / 26); }
        const ref = `'${tab.replace(/'/g, "''")}'!${col}${r + 1}`;
        const [cell] = await sb.readCells([ref]);
        if (!cell.formula) diffs.push(ref);
      }
    }
  }
  return diffs;
}
