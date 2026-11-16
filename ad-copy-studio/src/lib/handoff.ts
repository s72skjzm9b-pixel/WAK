// Lifecycle buckets, plain-language impact and the handoff list. Shared by the Changes screen and the export
// so both always agree. Decided by lifecycle, never by age.

export type Stage = 'draft' | 'ready' | 'approved' | 'toApply' | 'applied' | 'history';
const FORMAT: Record<string, string> = { search: 'Search', pmax: 'Performance Max', demand_gen: 'Demand Gen' };
const MARKET: Record<string, string> = { US: 'US', UK: 'UK', EU: 'EU', DK: 'Denmark', DE: 'Germany', NY: 'New York' };
const CANONICAL = ['EN', 'DK', 'DE'];

export function stageOf(s: { state: string; kind: string; language: string; appliedAt: string | null }): Stage {
  if (s.appliedAt) return 'applied';
  if (s.state === 'withdrawn' || s.state === 'superseded') return 'history';
  if (s.state === 'draft' || s.state === 'changes_requested') return 'draft';
  if (s.state === 'submitted') return 'ready';
  if (s.state === 'written') return 'toApply';
  if (s.state === 'approved') {
    if (s.kind === 'variation' || s.kind === 'retire') return 'toApply'; // to register / remove in Google Ads
    return CANONICAL.includes(s.language) ? 'approved' : 'approved'; // waiting for the Sheet, or local-only language
  }
  return 'history';
}

export interface Impact { groups: { campaign: string; group: string; format: string; market: string }[]; studio: { collection: string; format: string | null }[]; summary: string }

/** Where a line is used in one language: factual Sheet mappings plus studio intent, in plain language. */
export function impactOf(v: any, sourceId: string, language: string): Impact {
  const item = v.items.find((i: any) => i.sourceId === sourceId);
  const groups = (item?.usages ?? []).filter((u: any) => u.language === language).map((u: any) => ({ campaign: u.campaign, group: u.group, format: u.format, market: u.market }));
  const studio = (v.intendedUses ?? []).filter((u: any) => u.sourceId === sourceId).map((u: any) => ({ collection: v.collections.find((c: any) => c.key === u.collection)?.name ?? u.collection, format: u.format }));
  const markets = [...new Set(groups.map((g: any) => MARKET[g.market] ?? g.market))];
  const formats = [...new Set(groups.map((g: any) => FORMAT[g.format] ?? g.format))];
  const parts: string[] = [];
  if (groups.length) parts.push(`Affects ${groups.length} ad group${groups.length === 1 ? '' : 's'} across ${markets.length} market${markets.length === 1 ? '' : 's'} (${markets.join(', ')}) · ${formats.join(', ')}`);
  if (studio.length) parts.push(`Studio use: ${studio.map((s: any) => s.collection + (s.format ? ` (${FORMAT[s.format] ?? s.format})` : '')).join(', ')}`);
  return { groups, studio, summary: parts.join(' · ') || 'Not used in any ad group yet' };
}

export interface HandoffRow { id: string; sourceId: string; todo: string; collection: string; language: string; languageName: string; field: string; old: string; new: string; whereText: string; sheetState: string; impact: Impact }

export function handoffItems(v: any): HandoffRow[] {
  const langName = (c: string) => v.languages?.find((l: any) => l.code === c)?.name ?? c;
  const colName = (s: any) => s.collection ? (v.collections.find((c: any) => c.key === s.collection)?.name ?? 'Ideas and unassigned')
    : v.collections.filter((c: any) => c.sourceIds.includes(s.sourceId)).map((c: any) => c.name).join(', ') || '—';
  return v.suggestions.filter((s: any) => stageOf(s) === 'toApply').map((s: any) => {
    const item = v.items.find((i: any) => i.sourceId === s.sourceId);
    const impact = impactOf(v, s.sourceId, s.language);
    const todo = s.kind === 'variation' ? 'Add new copy' : s.kind === 'retire' ? 'Remove or pause' : 'Replace';
    return {
      id: s.id, sourceId: s.sourceId, todo, collection: colName(s), language: s.language, languageName: langName(s.language),
      field: s.meta?.assetType ?? item?.assetType ?? '', old: s.kind === 'variation' ? '' : s.baseText, new: s.kind === 'retire' ? '(remove)' : s.proposedText,
      whereText: impact.summary, sheetState: s.state === 'written' ? 'In the Sheet (verified)' : 'Approved in the studio — not in the Sheet yet', impact,
    };
  }).sort((a: HandoffRow, b: HandoffRow) => a.collection.localeCompare(b.collection) || a.language.localeCompare(b.language));
}
