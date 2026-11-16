// Local, writable practice copy of the workbook. It recalculates the same formula-driven cells the
// real Sheet does (see workbook/formulas.ts), including the fixed row bound of the
// "Updates for Anabelle" FILTER, so the full approve → compare → acknowledge loop can be exercised
// without touching Google. It is clearly labelled in the UI and never used for handover exports
// unless the user explicitly selects sandbox mode.
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { Lang, RawWorkbook } from '../workbook/types';
import { parseWorkbook, TAB, isSourceId, toLang } from '../workbook/parse';
import { evaluateRefRow, translationStatus, UPDATES_FILTER_LAST_ROW } from '../workbook/formulas';
import { SheetError, type CellRead, type CellWrite, type SheetGateway, type SheetErrorKind } from './gateway';
import { parseA1 } from './a1';

export interface SandboxFaults {
  failNextWrites?: { count: number; kind: SheetErrorKind; message?: string; afterApplying?: boolean; partial?: boolean };
}

export class SandboxGateway implements SheetGateway {
  readonly mode = 'sandbox' as const;
  readonly canWrite = true;
  faults: SandboxFaults = {};
  writeLog: CellWrite[][] = [];
  private wb: RawWorkbook;

  constructor(seed: RawWorkbook, private file: string | null = null) {
    if (file && existsSync(file)) this.wb = JSON.parse(readFileSync(file, 'utf8'));
    else { this.wb = { ...structuredClone(seed), origin: 'sandbox' }; this.recalculate(); this.persist(); }
  }

  describe() { return 'Local sandbox copy (practice only — not the real Google Sheet)'; }

  async readWorkbook(): Promise<RawWorkbook> {
    return { ...structuredClone(this.wb), readAt: new Date().toISOString(), origin: 'sandbox' };
  }

  async readCells(refs: string[]): Promise<CellRead[]> {
    return refs.map((ref) => {
      const p = parseA1(ref);
      const value = this.wb.tabs[p.tab]?.values[p.row - 1]?.[p.col] ?? '';
      return { ref, value, formula: this.isFormulaCell(p.tab, p.col, p.row) ? '=<formula>' : null };
    });
  }

  async writeCells(writes: CellWrite[]): Promise<void> {
    const f = this.faults.failNextWrites;
    if (f && f.count > 0) {
      f.count -= 1;
      if (f.afterApplying) this.apply(writes); // e.g. the response was lost after Google applied it
      else if (f.partial) this.apply(writes.slice(0, 1)); // only the first cell landed
      throw new SheetError(f.kind, f.message ?? `Simulated ${f.kind} failure`, f.kind === 'network' || f.kind === 'rate_limited' || f.kind === 'server');
    }
    for (const w of writes) {
      const p = parseA1(w.ref);
      if (this.isFormulaCell(p.tab, p.col, p.row)) throw new SheetError('invalid', `Refusing to overwrite formula cell ${w.ref}`);
    }
    this.apply(writes);
  }

  /** Test/practice helper: someone edits the Sheet directly (bypasses formula guard like a human would not). */
  simulateExternalEdit(ref: string, value: string) { this.apply([{ ref, value }]); }

  /** Test helper: insert empty rows (1-based position) the way Google does, shifting rows below. */
  insertRows(tab: string, at: number, count: number) {
    const v = this.wb.tabs[tab].values;
    v.splice(at - 1, 0, ...Array.from({ length: count }, () => [] as string[]));
    this.recalculate(); this.persist();
  }

  private apply(writes: CellWrite[]) {
    for (const w of writes) {
      const p = parseA1(w.ref);
      const t = this.wb.tabs[p.tab];
      if (!t) throw new SheetError('invalid', `Unknown tab in ${w.ref}`);
      while (t.values.length < p.row) t.values.push([]);
      const row = t.values[p.row - 1];
      while (row.length <= p.col) row.push('');
      row[p.col] = w.value;
    }
    this.writeLog.push(writes);
    this.recalculate();
    this.persist();
  }

  private persist() {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.wb));
    renameSync(tmp, this.file);
  }

  // Which cells hold formulas in the real workbook (by header-located column).
  private isFormulaCell(tab: string, col: number, row: number): boolean {
    const p = parseWorkbook(this.wb);
    if (tab === TAB.source) return col === p.sourceCols.chars?.index && row > p.sourceHeaderRow + 1;
    if (tab === TAB.translation) return [p.translationCols.english, p.translationCols.dkStatus, p.translationCols.deStatus].some((c) => c?.index === col) && row > 4;
    if (tab === TAB.changeRef) return ['current', 'currentEnglish', 'textChange', 'translationCheck', 'action'].some((k) => p.changeRefCols[k]?.index === col) && row > 4;
    if (tab === TAB.updates) return row >= 5;
    const c = p.campaigns.find((x) => x.name === tab);
    if (c && c.copyCol) return row > 4 && (col === c.copyCol.index || col === c.copyCol.index + (c.language === 'EN' ? 1 : 2) || (c.language !== 'EN' && col === c.copyCol.index + 1)) && c.memberships.some((m) => m.row === row);
    return false;
  }

  /** Recompute every formula-driven cell exactly as the workbook would. */
  private recalculate() {
    const p = parseWorkbook(this.wb);
    const src = this.wb.tabs[TAB.source].values;
    const tr = this.wb.tabs[TAB.translation].values;
    const cr = this.wb.tabs[TAB.changeRef].values;
    const set = (grid: string[][], r: number, c: number, v: string) => { while (grid[r - 1].length <= c) grid[r - 1].push(''); grid[r - 1][c] = v; };
    const english = new Map<string, string>();
    for (const s of p.source) { english.set(s.sourceId, s.english); set(src, s.row, p.sourceCols.chars.index, String(s.english.length)); }
    const trText = new Map<string, { DK: string; DE: string }>();
    for (const t of p.translations) trText.set(t.sourceId, { DK: t.dk, DE: t.de });
    // Translation review C is positional in the real Sheet (='Source copy'!E{row}); same row numbers today.
    for (const t of p.translations) set(tr, t.row, p.translationCols.english.index, src[t.row - 1]?.[p.sourceCols.english.index] ?? '');
    const c = p.changeRefCols;
    const hByKey = new Map<string, string>();
    const updates: string[][] = [];
    for (let r = 5; r <= cr.length; r++) {
      const row = cr[r - 1];
      const id = (row?.[c.id.index] ?? '').trim();
      const lang = toLang(row?.[c.lang.index] ?? '') as Lang | null;
      if (!id || !isSourceId(id) || !lang) continue;
      const current = lang === 'EN' ? english.get(id) ?? '' : trText.get(id)?.[lang] ?? '';
      const curEn = english.get(id) ?? '';
      set(cr, r, c.current.index, current);
      set(cr, r, c.currentEnglish.index, curEn);
      const ev = evaluateRefRow({
        lang, previous: row[c.previous.index] ?? '', current, englishAtRef: row[c.englishAtRef.index] ?? '', currentEnglish: curEn,
        approvedReplacement: row[c.approvedReplacement.index] ?? '', approvedEnglish: row[c.approvedEnglish.index] ?? '',
      });
      set(cr, r, c.textChange.index, ev.textChange);
      set(cr, r, c.translationCheck.index, ev.translationCheck);
      set(cr, r, c.action.index, ev.action);
      hByKey.set(`${id}|${lang}`, ev.translationCheck);
      if (r <= UPDATES_FILTER_LAST_ROW && ev.action !== 'No pending change') updates.push(cr[r - 1].slice(0, 12));
    }
    for (const t of p.translations) {
      set(tr, t.row, p.translationCols.dkStatus.index, translationStatus(hByKey.get(`${t.sourceId}|DK`) ?? '', t.dk));
      set(tr, t.row, p.translationCols.deStatus.index, translationStatus(hByKey.get(`${t.sourceId}|DE`) ?? '', t.de));
    }
    const up = this.wb.tabs[TAB.updates].values;
    up.length = 4;
    if (updates.length) up.push(...updates.map((r) => [...r]));
    else up.push(['No changes since the saved reference']);
    for (const camp of p.campaigns) {
      if (!camp.copyCol) continue;
      const grid = this.wb.tabs[camp.name].values;
      for (const m of camp.memberships) {
        const text = camp.language === 'EN' ? english.get(m.sourceId) ?? '' : trText.get(m.sourceId)?.[camp.language] ?? '';
        set(grid, m.row, camp.copyCol.index, text);
        if (camp.language === 'EN') set(grid, m.row, camp.copyCol.index + 1, String(text.length));
        else { set(grid, m.row, camp.copyCol.index + 1, english.get(m.sourceId) ?? ''); set(grid, m.row, camp.copyCol.index + 2, String(text.length)); }
      }
    }
  }
}
