// Client-side helpers for the workspace. Pure functions over the /api/workspace payload plus unsaved edits.
import { generateCombos, type Combo, type PoolAsset } from './combos';
import type { CampaignFormat, Lang } from '@/server/workbook/types';

export type WLang = Lang;
export interface WItem { sourceId: string; assetType: string; linkedHeadline: string | null; versions: Record<Lang, { text: string; status: string }>; usages: { campaign: string; group: string; format: CampaignFormat; language: Lang }[]; [k: string]: any }
export interface WSuggestion { id: string; kind: 'replace' | 'variation' | 'retire'; sourceId: string; language: Lang; baseText: string; proposedText: string; englishBasis: string; state: string; syncState: string; syncDetail: string; collection: string | null; meta: any; returnedNote: string | null; updatedAt: string; createdAt: string }
export interface WGroup { campaign: string; group: string; format: CampaignFormat; language: Lang; market: string; sourceIds: string[]; signature: string }
export interface WCollection { key: string; name: string; intent: string; audience: string; destination: string; destinationConfirmed: boolean; note: string | null; languages: Lang[]; markets: Partial<Record<Lang, string[]>>; formats: Partial<Record<Lang, CampaignFormat[]>>; groups: WGroup[]; sourceIds: string[]; pairing: boolean; previewable: boolean }

export const OPEN_STATES = ['draft', 'submitted', 'changes_requested', 'approved'];
export const LANG_LABEL: Record<Lang, string> = { EN: 'English', DK: 'Danish', DE: 'German' };
export const FORMAT_LABEL: Record<string, string> = { search: 'Search', pmax: 'Performance Max', demand_gen: 'Demand Gen', unknown: 'Other' };

/** One row in the editor: an existing Sheet line or a new line added in the studio. */
export interface Row {
  key: string; // sourceId
  sourceId: string;
  isNew: boolean;
  assetType: string;
  linkedHeadline: string | null;
  sheet: Record<Lang, string>; // Sheet wording ('' for new lines)
  sheetStatus: Record<Lang, string>;
  suggestion: Partial<Record<Lang, WSuggestion>>;
}

export function rowsFor(col: WCollection, items: WItem[], suggestions: WSuggestion[]): Row[] {
  const byId = new Map(items.map((i) => [i.sourceId, i]));
  const open = suggestions.filter((s) => OPEN_STATES.includes(s.state));
  const rows: Row[] = [];
  for (const id of col.sourceIds) {
    const it = byId.get(id);
    if (!it) continue;
    const sug: Row['suggestion'] = {};
    for (const s of open) if (s.sourceId === id && s.kind !== 'variation') sug[s.language] = s;
    rows.push({ key: id, sourceId: id, isNew: false, assetType: it.assetType, linkedHeadline: it.linkedHeadline,
      sheet: { EN: it.versions.EN.text, DK: it.versions.DK.text, DE: it.versions.DE.text },
      sheetStatus: { EN: it.versions.EN.status, DK: it.versions.DK.status, DE: it.versions.DE.status }, suggestion: sug });
  }
  const newIds = [...new Set(open.filter((s) => s.kind === 'variation' && s.collection === col.key).map((s) => s.sourceId))];
  for (const id of newIds) {
    const sug: Row['suggestion'] = {};
    for (const s of open) if (s.sourceId === id && s.kind === 'variation') sug[s.language] = s;
    const en = sug.EN;
    rows.push({ key: id, sourceId: id, isNew: true, assetType: en?.meta?.assetType ?? 'Headline', linkedHeadline: null,
      sheet: { EN: '', DK: '', DE: '' }, sheetStatus: { EN: '', DK: '', DE: '' }, suggestion: sug });
  }
  return rows;
}

/** Text currently shown for a row/language: unsaved local edit > saved suggestion > Sheet. */
export function shownText(row: Row, lang: Lang, edits: Record<string, string>): string {
  const k = `${row.sourceId}|${lang}`;
  if (k in edits) return edits[k];
  return row.suggestion[lang]?.proposedText ?? row.sheet[lang];
}

/** Does this translation need checking against the English? Never rewrites anything. */
export function translationNeedsReview(row: Row, lang: Lang, edits: Record<string, string>): boolean {
  if (lang === 'EN') return false;
  const english = shownText(row, 'EN', edits);
  const own = row.suggestion[lang];
  const text = shownText(row, lang, edits);
  if (!text) return false; // nothing translated yet
  if (own) return own.englishBasis !== english && !(`${row.sourceId}|${lang}` in edits);
  if (row.isNew) return false;
  if (english !== row.sheet.EN) return true; // English is being changed; existing translation must be checked
  return /recheck/i.test(row.sheetStatus[lang] ?? '');
}

export function isEdited(row: Row, lang: Lang, edits: Record<string, string>) {
  return !row.isNew && shownText(row, lang, edits) !== row.sheet[lang];
}

/** Illustrative combinations for a collection in one language and format. Groups with identical
 *  membership are previewed once; separate groups (e.g. brand pairs) never mix. */
export function collectionCombos(col: WCollection, rows: Row[], lang: Lang, format: CampaignFormat, edits: Record<string, string>, englishById: Map<string, string>): { combos: Combo[]; basedOn: WGroup[]; notes: string[] } {
  const groups = col.groups.filter((g) => g.language === lang && g.format === format);
  const seen = new Set<string>();
  const distinct = groups.filter((g) => (seen.has(g.signature) ? false : (seen.add(g.signature), true)));
  const byId = new Map(rows.map((r) => [r.sourceId, r]));
  const lists: Combo[][] = [];
  const notes = new Set<string>();
  for (const g of distinct) {
    const assets: PoolAsset[] = [];
    for (const id of g.sourceIds) {
      const r = byId.get(id);
      if (!r) continue;
      const text = shownText(r, lang, edits);
      const suggested = text !== r.sheet[lang];
      assets.push({ sourceId: id, assetType: r.assetType, text, linkedHeadline: r.linkedHeadline, state: !text ? 'missing' : suggested ? 'proposed' : 'sheet', label: !text ? `Not yet translated` : undefined });
    }
    // New lines added in this collection join its groups in their language — except fixed pairs, which stay as they are.
    if (!col.pairing) for (const r of rows.filter((x) => x.isNew)) {
      const text = shownText(r, lang, edits);
      if (text) assets.push({ sourceId: r.sourceId, assetType: r.assetType, text, linkedHeadline: null, state: 'proposed' });
    }
    const res = generateCombos({ campaign: g.campaign, group: g.group, format, language: lang, assets, pins: {} }, englishById);
    res.notes.forEach((n) => notes.add(n));
    lists.push(res.all);
  }
  // Interleave groups so the first page shows variety.
  const combos: Combo[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) combos.push(l[i]);
  return { combos, basedOn: distinct, notes: [...notes] };
}

export interface FeedbackRow { id: string; comboKey: string; combo: { slots: { slot: string; sourceId: string; text: string }[]; language: Lang; format: string }; verdict: 'works' | 'needs_changes' | 'comment'; comment: string; reasons: string[]; reviewer: string; createdAt: string }

/** Feedback for exactly this wording (current) and for earlier wording of the same combination (history). */
export function feedbackFor(combo: Combo, all: FeedbackRow[]) {
  const sameShape = (f: FeedbackRow) => f.combo.language === combo.language && f.combo.format === combo.format && f.combo.slots.length === combo.slots.length && f.combo.slots.every((s, i) => s.sourceId === combo.slots[i]?.sourceId && s.slot === combo.slots[i]?.slot);
  const exact = (f: FeedbackRow) => f.combo.slots.every((s, i) => s.text === combo.slots[i]?.text);
  const mine = all.filter(sameShape);
  return { current: mine.filter(exact), earlier: mine.filter((f) => !exact(f)) };
}

/** Lines whose current wording appears in a combination whose latest feedback says "needs work". */
export function needsWorkKeys(combos: Combo[], all: FeedbackRow[]): Set<string> {
  const out = new Set<string>();
  for (const c of combos) {
    const latest = feedbackFor(c, all).current.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest?.verdict === 'needs_changes') for (const s of c.slots) out.add(s.sourceId);
  }
  return out;
}
