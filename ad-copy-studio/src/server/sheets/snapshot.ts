import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RawWorkbook } from '../workbook/types';
import { SheetError, type CellRead, type SheetGateway } from './gateway';
import { parseA1 } from './a1';

export function loadSnapshotFile(file = path.join(process.cwd(), 'seed', 'workbook-snapshot.json')): RawWorkbook {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return { spreadsheetId: j.spreadsheetId, title: j.title, tabs: j.tabs, readAt: j.capturedAt, origin: 'snapshot', limitations: j.limitations };
}

export class SnapshotGateway implements SheetGateway {
  readonly mode = 'snapshot' as const;
  readonly canWrite = false;
  constructor(private wb: RawWorkbook = loadSnapshotFile()) {}
  describe() { return `Read-only snapshot of the live workbook captured ${this.wb.readAt}`; }
  async readWorkbook() { return structuredClone(this.wb); }
  async readCells(refs: string[]): Promise<CellRead[]> {
    return refs.map((ref) => { const p = parseA1(ref); return { ref, value: this.wb.tabs[p.tab]?.values[p.row - 1]?.[p.col] ?? '', formula: null }; });
  }
  async writeCells(): Promise<void> {
    throw new SheetError('read_only', 'The snapshot is read-only. Connect the live Google Sheet (or use the sandbox) to write.');
  }
}
