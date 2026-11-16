// Plans exactly which workbook cells an approved revision will change, and predicts how the
// workbook's own formulas will respond. Pure function of a freshly parsed workbook.
//
// For an approved replacement of an existing line it writes ONLY:
//   1. the canonical text cell — Source copy (English) or Translation review (Danish / German), and
//   2. the matching Change reference row's "approved replacement" and "approved English" cells (I/J),
//      which is the workbook's documented exact-text approval mechanism.
// It never writes the saved reference (C/E): that is advanced only after Anabelle acknowledges
// application (see planAdvanceReference).
import type { Lang, ParsedWorkbook } from '../workbook/types';
import { evaluateRefRow, UPDATES_FILTER_LAST_ROW } from '../workbook/formulas';
import { TAB } from '../workbook/parse';
import { a1 } from '../sheets/a1';

export interface PlannedCell {
  ref: string;
  tab: string;
  row: number;
  column: string; // header text, for humans
  expectedBefore: string | null; // null = not a conflict condition (recorded for information)
  after: string;
  purpose: string;
}

export interface Prediction { sourceId: string; lang: Lang; textChange: string; translationCheck: string; action: string; inUpdates: boolean }

export interface WritePlan {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  cells: PlannedCell[];
  /** Cells that must hold a value (not a formula) right before writing. */
  mustNotBeFormula: string[];
  /** Cells that must still equal these values right before writing (concurrency guard). */
  guards: { ref: string; equals: string; why: string }[];
  predictions: Prediction[];
  updatesFormulaRef: string | null;
}

export interface PlanInput {
  sourceId: string;
  language: Lang;
  baseText: string;
  proposedText: string;
  englishBasis: string; // for EN: the proposed English itself
  /** Resume after a partial write: the text cell already holds the proposed wording (written by this proposal). */
  resume?: boolean;
}

function uniqueRow<T extends { sourceId: string }>(rows: T[], id: string): { row: T | null; error: string | null } {
  const m = rows.filter((r) => r.sourceId === id);
  if (m.length === 0) return { row: null, error: 'not found' };
  if (m.length > 1) return { row: null, error: 'appears more than once' };
  return { row: m[0], error: null };
}

export function planReplacement(p: ParsedWorkbook, input: PlanInput): WritePlan {
  const blockers: string[] = [], warnings: string[] = [];
  const cells: PlannedCell[] = [];
  const guards: WritePlan['guards'] = [];
  const mustNotBeFormula: string[] = [];
  const predictions: Prediction[] = [];
  const { sourceId, language: lang } = input;

  const src = uniqueRow(p.source, sourceId);
  if (!src.row) blockers.push(`${sourceId} ${src.error} in Source copy.`);
  if (input.proposedText === input.baseText && !input.resume) blockers.push('The proposed wording is identical to the wording it replaces.');
  if (!input.proposedText.trim()) blockers.push('Blank wording cannot be approved as a replacement. Propose a retirement instead.');

  let targetRef = '', currentText = '';
  if (src.row) {
    if (lang === 'EN') {
      const col = p.sourceCols.english;
      if (!col) blockers.push('Source copy English column not found.');
      else {
        targetRef = a1(TAB.source, col.index, src.row.row);
        currentText = src.row.english;
        cells.push({ ref: targetRef, tab: TAB.source, row: src.row.row, column: col.header, expectedBefore: input.baseText, after: input.proposedText, purpose: 'Canonical English wording' });
      }
    } else {
      const tr = uniqueRow(p.translations, sourceId);
      const col = lang === 'DK' ? p.translationCols.dk : p.translationCols.de;
      if (!tr.row) blockers.push(`${sourceId} ${tr.error} in Translation review.`);
      else if (!col) blockers.push(`Translation review ${lang} column not found.`);
      else {
        targetRef = a1(TAB.translation, col.index, tr.row.row);
        currentText = lang === 'DK' ? tr.row.dk : tr.row.de;
        cells.push({ ref: targetRef, tab: TAB.translation, row: tr.row.row, column: col.header, expectedBefore: input.baseText, after: input.proposedText, purpose: `Canonical ${lang === 'DK' ? 'Danish' : 'German'} wording` });
        // The translation must be approved against the English that is in the Sheet now.
        if (src.row.english !== input.englishBasis) blockers.push('The English source has changed since this translation was drafted (or the draft is based on an unwritten English proposal). Re-review the translation against the current English.');
        else if (p.sourceCols.english) guards.push({ ref: a1(TAB.source, p.sourceCols.english.index, src.row.row), equals: input.englishBasis, why: 'English basis unchanged' });
      }
    }
    if (targetRef) {
      mustNotBeFormula.push(targetRef);
      const expected = input.resume ? input.proposedText : input.baseText;
      cells[0].expectedBefore = expected;
      guards.push({ ref: targetRef, equals: expected, why: input.resume ? 'Approved wording still in place (resuming a partial write)' : 'Sheet wording unchanged since the proposal was drafted' });
      if (currentText !== expected) blockers.push(`Conflict: the Sheet now reads “${currentText}”, not the “${input.baseText}” this proposal was based on.`);
    }
  }

  // Change reference I/J.
  const crRows = p.changeRef.filter((r) => r.sourceId === sourceId && r.lang === lang);
  const crc = p.changeRefCols;
  if (crRows.length !== 1) blockers.push(`Change reference has ${crRows.length} rows for ${sourceId}/${lang}; exactly one is required so the change appears in Updates for Anabelle.`);
  else if (!crc.approvedReplacement || !crc.approvedEnglish) blockers.push('Change reference approval columns not found.');
  else {
    const cr = crRows[0];
    if (cr.row > UPDATES_FILTER_LAST_ROW) warnings.push(`Change reference row ${cr.row} is outside the Updates for Anabelle FILTER range (rows 5–${UPDATES_FILTER_LAST_ROW}) recorded at build time; the app re-reads the formula before writing.`);
    const approvedEnglish = lang === 'EN' ? input.proposedText : input.englishBasis;
    const iRef = a1(TAB.changeRef, crc.approvedReplacement.index, cr.row);
    const jRef = a1(TAB.changeRef, crc.approvedEnglish.index, cr.row);
    if (cr.approvedReplacement && cr.action === 'Approved — apply / acknowledge' && cr.approvedReplacement !== input.proposedText) {
      warnings.push(`A different approved replacement (“${cr.approvedReplacement}”) is still waiting for Anabelle on this row. This approval replaces that instruction.`);
    }
    cells.push({ ref: iRef, tab: TAB.changeRef, row: cr.row, column: crc.approvedReplacement.header, expectedBefore: null, after: input.proposedText, purpose: 'Exact approved wording (approval record)' });
    cells.push({ ref: jRef, tab: TAB.changeRef, row: cr.row, column: crc.approvedEnglish.header, expectedBefore: null, after: approvedEnglish, purpose: 'English the approval covers' });
    mustNotBeFormula.push(iRef, jRef);
    const ev = evaluateRefRow({ lang, previous: cr.previous, current: input.proposedText, englishAtRef: cr.englishAtRef, currentEnglish: lang === 'EN' ? input.proposedText : cr.currentEnglish, approvedReplacement: input.proposedText, approvedEnglish });
    predictions.push({ sourceId, lang, ...ev, inUpdates: ev.action !== 'No pending change' && cr.row <= UPDATES_FILTER_LAST_ROW });
    if (ev.action === 'No pending change') warnings.push('The new wording equals the saved reference, so nothing will appear in Updates for Anabelle (the change reverts to what she last applied).');
  }

  // Pairing integrity: descriptions name their headline by its English wording (Source copy, linked headline column).
  // When a paired headline's English changes, update those links in the same write so the pairs survive.
  if (lang === 'EN' && src.row && p.sourceCols.linked && input.baseText && input.proposedText !== input.baseText) {
    for (const dep of p.source.filter((r) => r.sourceId !== sourceId && r.linkedHeadline === input.baseText)) {
      const ref = a1(TAB.source, p.sourceCols.linked.index, dep.row);
      cells.push({ ref, tab: TAB.source, row: dep.row, column: p.sourceCols.linked.header, expectedBefore: input.baseText, after: input.proposedText, purpose: `Keep ${dep.sourceId} paired with this headline` });
      mustNotBeFormula.push(ref);
      guards.push({ ref, equals: input.baseText, why: `Pairing of ${dep.sourceId} unchanged` });
    }
  }

  // English edits flag translations.
  if (lang === 'EN') {
    for (const r of p.changeRef.filter((x) => x.sourceId === sourceId && x.lang !== 'EN')) {
      const ev = evaluateRefRow({ lang: r.lang, previous: r.previous, current: r.current, englishAtRef: r.englishAtRef, currentEnglish: input.proposedText, approvedReplacement: r.approvedReplacement, approvedEnglish: r.approvedEnglish });
      predictions.push({ sourceId, lang: r.lang, ...ev, inUpdates: ev.action !== 'No pending change' && r.row <= UPDATES_FILTER_LAST_ROW });
    }
  }

  return {
    ok: blockers.length === 0, blockers, warnings, cells, mustNotBeFormula, guards, predictions,
    updatesFormulaRef: p.tabsFound.includes(TAB.updates) ? `'${TAB.updates}'!A5` : null,
  };
}

/** After Anabelle acknowledges application: copy current D/F into saved reference C/E for one row. */
export function planAdvanceReference(p: ParsedWorkbook, sourceId: string, lang: Lang, appliedText: string): WritePlan {
  const blockers: string[] = [], warnings: string[] = [];
  const cells: PlannedCell[] = [], guards: WritePlan['guards'] = [], mustNotBeFormula: string[] = [];
  const rows = p.changeRef.filter((r) => r.sourceId === sourceId && r.lang === lang);
  const c = p.changeRefCols;
  if (rows.length !== 1) blockers.push(`Change reference has ${rows.length} rows for ${sourceId}/${lang}.`);
  else if (!c.previous || !c.englishAtRef || !c.current) blockers.push('Change reference columns not found.');
  else {
    const r = rows[0];
    if (r.current !== appliedText) blockers.push(`Conflict: current wording is now “${r.current}”, but Anabelle acknowledged applying “${appliedText}”. The reference was not advanced.`);
    const cRef = a1(TAB.changeRef, c.previous.index, r.row), eRef = a1(TAB.changeRef, c.englishAtRef.index, r.row);
    cells.push({ ref: cRef, tab: TAB.changeRef, row: r.row, column: c.previous.header, expectedBefore: null, after: r.current, purpose: 'Saved reference wording ← current wording' });
    cells.push({ ref: eRef, tab: TAB.changeRef, row: r.row, column: c.englishAtRef.header, expectedBefore: null, after: r.currentEnglish, purpose: 'Saved English reference ← current English' });
    mustNotBeFormula.push(cRef, eRef);
    guards.push({ ref: a1(TAB.changeRef, c.current.index, r.row), equals: appliedText, why: 'Wording unchanged since acknowledgement' });
    if (r.currentEnglish !== r.englishAtRef && lang !== 'EN') warnings.push('This also records the current English as the reference for this translation.');
  }
  return { ok: blockers.length === 0, blockers, warnings, cells, mustNotBeFormula, guards, predictions: [], updatesFormulaRef: null };
}

/** Reads the FILTER bound out of the Updates for Anabelle formula, e.g. ...K5:K148... → 148. */
export function updatesBound(formula: string | null): number | null {
  if (!formula) return null;
  const m = /K5:K(\d+)/i.exec(formula);
  return m ? Number(m[1]) : /K5:K\b|K:K/i.test(formula) ? Number.MAX_SAFE_INTEGER : null;
}
