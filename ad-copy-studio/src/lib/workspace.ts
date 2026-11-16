// Client-side helpers for the workspace. Pure functions over the /api/workspace payload plus unsaved edits.
import { generateCombos, type Combo, type PoolAsset } from './combos';
import type { CampaignFormat } from '@/server/workbook/types';

export type WLang = string; // 'EN' | 'DK' | 'DE' | extra local languages
export const CANONICAL = ['EN', 'DK', 'DE'];
export interface WSuggestion { id: string; kind: 'replace' | 'variation' | 'retire'; sourceId: string; language: string; baseText: string; proposedText: string; englishBasis: string; state: string; syncState: string; syncDetail: string; collection: string | null; meta: any; returnedNote: string | null; updatedAt: string; createdAt: string; readyAt: string | null; appliedAt: string | null; needsIntendedUse?: boolean; provenance?: { mode: string; at: string } | null; approveLabel?: string }
export interface WGroup { campaign: string; group: string; format: CampaignFormat; language: string; market: string; sourceIds: string[]; signature: string }
export interface WCollection { key: string; name: string; intent: string; audience: string; destination: string; destinationConfirmed: boolean; note: string | null; languages: string[]; markets: Record<string, string[]>; formats: Record<string, CampaignFormat[]>; groups: WGroup[]; sourceIds: string[]; pairing: boolean; previewable: boolean; description: string; imageNote: string; intendedFormats: CampaignFormat[]; studioLanguages: string[]; details: { finalUrl?: string; path1?: string; path2?: string; cta?: string }; isLocal: boolean; isIdeas: boolean; workbookGaps: { campaign: string; assetType: string; note: string }[] }
export interface WUse { id: string; sourceId: string; collection: string; field: string | null; format: string | null }

export const OPEN_STATES = ['draft', 'submitted', 'changes_requested', 'approved'];
export const FORMAT_LABEL: Record<string, string> = { search: 'Search', pmax: 'Performance Max', demand_gen: 'Demand Gen', unknown: 'Other' };

/** One row in the editor: an existing Sheet line or a new line created in the studio. */
export interface Row {
  key: string;
  sourceId: string;
  isNew: boolean;
  assetType: string;
  linkedHeadlineId: string | null;
  sheet: Record<string, string>; // Sheet wording ('' for new lines and local-only languages)
  sheetStatus: Record<string, string>;
  suggestion: Record<string, WSuggestion | undefined>;
  home: string | null; // home collection for new copy
  mappedHere: boolean; // factual Sheet mapping in this collection
  usedIn: { key: string; name: string; kind: 'mapped' | 'studio' }[]; // across collections
  separatedFrom: string | null;
}

export function rowsFor(col: WCollection, v: any): Row[] {
  const items: any[] = v.items, suggestions: WSuggestion[] = v.suggestions, uses: WUse[] = v.intendedUses ?? [];
  const byId = new Map(items.map((i) => [i.sourceId, i]));
  const open = suggestions.filter((s) => OPEN_STATES.includes(s.state) && !s.appliedAt);
  const name = (k: string) => v.collections.find((c: any) => c.key === k)?.name ?? k;
  const usedIn = (id: string): Row['usedIn'] => {
    const mapped = (byId.get(id)?.mappedCollections ?? []).map((k: string) => ({ key: k, name: name(k), kind: 'mapped' as const }));
    const studio = uses.filter((u) => u.sourceId === id && !mapped.some((m: any) => m.key === u.collection)).map((u) => ({ key: u.collection, name: name(u.collection), kind: 'studio' as const }));
    const out: Row['usedIn'] = [];
    for (const x of [...mapped, ...studio]) if (!out.some((o) => o.key === x.key)) out.push(x);
    return out;
  };
  const rows: Row[] = [];
  const studioHere = uses.filter((u) => u.collection === col.key).map((u) => u.sourceId);
  for (const id of [...col.sourceIds, ...studioHere.filter((x) => byId.has(x) && !col.sourceIds.includes(x))]) {
    const it = byId.get(id);
    if (!it) continue;
    const sug: Row['suggestion'] = {};
    for (const s of open) if (s.sourceId === id && s.kind !== 'variation') sug[s.language] = s;
    const field = uses.find((u) => u.sourceId === id && u.collection === col.key)?.field;
    rows.push({ key: id, sourceId: id, isNew: false, assetType: col.isIdeas ? it.assetType : (field ?? it.assetType), linkedHeadlineId: it.linkedHeadlineId ?? null,
      sheet: { EN: it.versions.EN.text, DK: it.versions.DK.text, DE: it.versions.DE.text }, sheetStatus: { EN: it.versions.EN.status, DK: it.versions.DK.status, DE: it.versions.DE.status },
      suggestion: sug, home: null, mappedHere: col.sourceIds.includes(id), usedIn: usedIn(id), separatedFrom: null });
  }
  // New copy whose HOME is this collection (organisation only — not deployment). Drafts without a home appear in Ideas.
  const homeOf = (s: WSuggestion) => s.collection ?? (s.needsIntendedUse ? 'not-yet-assigned' : null);
  const newIds = [...new Set(open.filter((s) => s.kind === 'variation' && homeOf(s) === col.key).map((s) => s.sourceId))];
  for (const id of newIds) {
    const sug: Row['suggestion'] = {};
    for (const s of open) if (s.sourceId === id && s.kind === 'variation') sug[s.language] = s;
    const en = sug.EN;
    rows.push({ key: id, sourceId: id, isNew: true, assetType: en?.meta?.assetType ?? 'Headline', linkedHeadlineId: en?.meta?.linkedHeadlineId ?? null,
      sheet: {}, sheetStatus: {}, suggestion: sug, home: col.key, mappedHere: false, usedIn: usedIn(id), separatedFrom: en?.meta?.separatedFrom ?? null });
  }
  return rows;
}

export const editKey = (sourceId: string, lang: string) => `${sourceId}|${lang}`;

/** Text currently shown: unsaved local edit > saved suggestion > Sheet. */
export function shownText(row: Row, lang: string, edits: Record<string, string>): string {
  const k = editKey(row.sourceId, lang);
  if (k in edits) return edits[k];
  return row.suggestion[lang]?.proposedText ?? row.sheet[lang] ?? '';
}

/** Translation must be checked against the current English. Never rewrites anything. */
export function translationNeedsReview(row: Row, lang: string, edits: Record<string, string>): boolean {
  if (lang === 'EN') return false;
  const english = shownText(row, 'EN', edits);
  const text = shownText(row, lang, edits);
  if (!text) return false;
  const own = row.suggestion[lang];
  if (own && !(editKey(row.sourceId, lang) in edits)) return own.englishBasis !== english;
  if (editKey(row.sourceId, lang) in edits) return false; // being written right now against the shown English
  if (row.isNew) return false;
  if (english !== (row.sheet.EN ?? '')) return true;
  return /recheck/i.test(row.sheetStatus[lang] ?? '');
}

/** The Sheet's own "Needs translation approval" flag for this field (factual, from the workbook). */
export function translationApprovalFlag(row: Row, lang: string) {
  return !row.isNew && CANONICAL.includes(lang) && lang !== 'EN' && /needs translation approval/i.test(row.sheetStatus[lang] ?? '');
}

export function isEdited(row: Row, lang: string, edits: Record<string, string>) {
  return !row.isNew && shownText(row, lang, edits) !== (row.sheet[lang] ?? '');
}

export type PreviewLabel = 'mapped' | 'intended' | 'preview-only';

/** Small representative set of illustrative combinations for one collection, language and format.
 *  - Mapped groups are previewed once each (identical memberships deduplicated), never mixed.
 *  - New copy appears only where an intended use puts it, or as a labelled “candidate preview”.
 *  - Pairs use stable source IDs, so editing a paired headline keeps its descriptions. */
export function collectionCombos(col: WCollection, rows: Row[], lang: string, format: CampaignFormat, edits: Record<string, string>, uses: WUse[], candidates: Set<string>): { combos: Combo[]; basedOn: WGroup[]; label: PreviewLabel; notes: string[]; candidateIds: Set<string> } {
  const byId = new Map(rows.map((r) => [r.sourceId, r]));
  const intendedHere = (r: Row) => uses.some((u) => u.sourceId === r.sourceId && u.collection === col.key && (!u.format || u.format === format));
  const candidateIds = new Set<string>();
  const asset = (r: Row, state?: PoolAsset['state']): PoolAsset | null => {
    const text = shownText(r, lang, edits);
    if (!text) return r.mappedHere ? { sourceId: r.sourceId, assetType: r.assetType, text: '', linkedHeadline: null, linkedHeadlineId: r.linkedHeadlineId, state: 'missing', label: 'Not written in this language' } : null;
    const suggested = r.isNew || text !== (r.sheet[lang] ?? '');
    return { sourceId: r.sourceId, assetType: r.assetType, text, linkedHeadline: null, linkedHeadlineId: r.linkedHeadlineId, state: state ?? (suggested ? 'proposed' : 'sheet') };
  };
  const extras = (groupIds: string[]) => rows.filter((r) => !groupIds.includes(r.sourceId) && (intendedHere(r) || candidates.has(r.sourceId))).filter((r) => {
    if (!col.pairing || !/description/i.test(r.assetType)) return true;
    return !!r.linkedHeadlineId && groupIds.includes(r.linkedHeadlineId); // pair-aware: a new description joins only its own headline
  });
  const groups = col.groups.filter((g) => g.language === lang && g.format === format);
  const seen = new Set<string>();
  const distinct = groups.filter((g) => (seen.has(g.signature) ? false : (seen.add(g.signature), true)));
  let label: PreviewLabel = 'mapped';
  let pools: { ids: string[]; g: WGroup | null }[] = distinct.map((g) => ({ ids: g.sourceIds, g }));
  if (!pools.length) {
    // Preview only: explore this format using the copy in this collection. Never changes any mapping.
    label = uses.some((u) => u.collection === col.key && u.format === format) || col.intendedFormats.includes(format) ? 'intended' : 'preview-only';
    const ids = rows.filter((r) => r.mappedHere || intendedHere(r)).map((r) => r.sourceId);
    if (col.pairing) {
      const heads = rows.filter((r) => /headline/i.test(r.assetType) && !/long/i.test(r.assetType) && ids.includes(r.sourceId));
      pools = heads.map((h) => ({ ids: [h.sourceId, ...rows.filter((d) => d.linkedHeadlineId === h.sourceId && ids.includes(d.sourceId)).map((d) => d.sourceId)], g: null }));
    } else pools = ids.length ? [{ ids, g: null }] : [];
  }
  const lists: Combo[][] = [];
  const notes = new Set<string>();
  for (const pool of pools) {
    const assets: PoolAsset[] = [];
    for (const id of pool.ids) { const r = byId.get(id); const a = r && asset(r); if (a) assets.push(a); }
    for (const r of extras(pool.ids)) {
      const a = asset(r, 'proposed');
      if (!a) continue;
      if (!intendedHere(r)) { candidateIds.add(r.sourceId); a.label = 'Candidate preview'; }
      assets.push(a);
    }
    const res = generateCombos({ campaign: pool.g?.campaign ?? col.name, group: pool.g?.group ?? 'preview', format, language: lang as any, assets, pins: {} }, new Map());
    res.notes.forEach((n) => notes.add(n));
    lists.push(representative(res.all));
  }
  const combos: Combo[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) combos.push(l[i]);
  return { combos, basedOn: distinct, label, notes: [...notes], candidateIds };
}

/** Order combinations so the first few cover every line at least once (simple greedy coverage). */
export function representative(all: Combo[], max = 400): Combo[] {
  const pool = all.slice(0, 4000);
  const covered = new Set<string>();
  const out: Combo[] = [];
  const left = [...pool];
  while (out.length < max && left.length) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < Math.min(left.length, 300); i++) {
      const score = left[i].slots.filter((s) => !covered.has(s.sourceId)).length * 10 + (left[i].slots.some((s) => s.state !== 'sheet') ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    const [c] = left.splice(best, 1);
    c.slots.forEach((s) => covered.add(s.sourceId));
    out.push(c);
  }
  return out;
}

// ---------------- feedback
export interface FeedbackRow { id: string; comboKey: string; combo: { slots: { slot: string; sourceId: string; text: string }[]; language: string; format: string }; verdict: 'works' | 'needs_changes' | 'comment'; comment: string; reviewer: string; createdAt: string; resolvedAt: string | null; supersededAt?: string | null; scope?: { kind: 'combination' | 'lines'; lines?: { sourceId: string; slot: string }[] }; language?: string }
export interface CommentRow { id: string; combo: any; language: string; text: string; author: string; createdAt: string; editedAt: string | null; deletedAt: string | null; resolvedAt: string | null }

const shapeOf = (c: { format: string; language: string; slots: { slot: string; sourceId: string }[] }) => [c.format, c.language, ...c.slots.map((s) => `${s.slot}=${s.sourceId}`)].join('|');
const identityOf = (c: { format: string; language: string; slots: { slot: string; sourceId: string; text: string }[] }) => [c.format, c.language, ...c.slots.map((s) => `${s.slot}=${s.sourceId}:${s.text}`)].join('|');
const fbCombo = (f: FeedbackRow) => ({ ...f.combo, language: f.language ?? f.combo.language });

/** Active verdict for exactly this wording; history = superseded/resolved verdicts and verdicts on earlier wording. */
export function feedbackFor(combo: Combo, all: FeedbackRow[], comments: CommentRow[]) {
  const id = identityOf(combo), shape = shapeOf(combo);
  const verdicts = all.filter((f) => f.verdict !== 'comment');
  const exact = verdicts.filter((f) => identityOf(fbCombo(f)) === id);
  const active = exact.filter((f) => !f.supersededAt && !f.resolvedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const earlier = verdicts.filter((f) => shapeOf(fbCombo(f)) === shape && identityOf(fbCombo(f)) !== id);
  const history = exact.filter((f) => f !== active);
  const cm = comments.filter((c) => !c.deletedAt && identityOf({ ...c.combo, language: c.language }) === id);
  const earlierComments = comments.filter((c) => !c.deletedAt && shapeOf({ ...c.combo, language: c.language }) === shape && identityOf({ ...c.combo, language: c.language }) !== id);
  return { active, history, earlier, comments: cm.filter((c) => !c.resolvedAt), resolvedComments: cm.filter((c) => c.resolvedAt), earlierComments };
}

/** A line is marked “Needs work” only when a reviewer picked that exact line (and language), on its current wording. */
export function lineNeedsWork(sourceId: string, lang: string, text: string, all: FeedbackRow[]): boolean {
  return all.some((f) => f.verdict === 'needs_changes' && !f.supersededAt && !f.resolvedAt && (f.language ?? f.combo.language) === lang && f.scope?.kind === 'lines'
    && (f.scope.lines ?? []).some((l) => l.sourceId === sourceId && f.combo.slots.some((s) => s.sourceId === sourceId && s.slot === l.slot && s.text === text)));
}
