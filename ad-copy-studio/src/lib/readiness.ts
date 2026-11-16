// Compact readiness per format for a collection in one language. Pure; recomputed as the user types.
import { limitFor, charCount } from './limits';

export const FORMAT_RULES: Record<string, { label: string; approximate: boolean; need: { field: string; min: number }[]; optional?: string[] }> = {
  search: { label: 'Search', approximate: false, need: [{ field: 'Headline', min: 3 }, { field: 'Description', min: 2 }] },
  pmax: { label: 'Performance Max', approximate: false, need: [{ field: 'Headline', min: 3 }, { field: 'Long headline', min: 1 }, { field: 'Description', min: 2 }] },
  demand_gen: { label: 'Demand Gen', approximate: true, need: [{ field: 'Headline', min: 1 }, { field: 'Description', min: 1 }], optional: ['Long headline'] },
};

export interface ReadinessLine { sourceId: string; field: string; text: string; translationApprovalNeeded: boolean; needsReview: boolean }
export interface Readiness {
  format: string; label: string; approximate: boolean; ready: boolean;
  counts: Record<string, number>; missing: string[]; over: number; overWarnings: number;
  translationApproval: number; review: number; destinationMissing: boolean; ctaMissing: boolean; workbookNotes: string[];
}

export function readinessFor(format: string, lines: ReadinessLine[], opts: { destinationConfirmed: boolean; cta?: string; workbookGaps?: { campaign: string; assetType: string; note: string }[] }): Readiness {
  const rule = FORMAT_RULES[format];
  const counts: Record<string, number> = { Headline: 0, 'Long headline': 0, Description: 0 };
  let over = 0, overWarnings = 0, ta = 0, rv = 0;
  for (const l of lines) {
    if (!l.text.trim()) continue;
    if (l.field in counts) counts[l.field]++;
    const lim = limitFor(l.field, format as any);
    if (lim && charCount(l.text) > lim.max) { if (lim.verified) over++; else overWarnings++; }
    if (l.translationApprovalNeeded) ta++;
    if (l.needsReview) rv++;
  }
  const missing = rule.need.filter((n) => (counts[n.field] ?? 0) < n.min).map((n) => `${n.min - (counts[n.field] ?? 0)} more ${n.field.toLowerCase()}${n.min - (counts[n.field] ?? 0) > 1 ? 's' : ''}`);
  const workbookNotes = (opts.workbookGaps ?? []).filter((g) => format === 'pmax' && /long headline/i.test(g.assetType)).length
    ? [`The Sheet marks a missing long headline in ${(opts.workbookGaps ?? []).filter((g) => /long headline/i.test(g.assetType)).length} Performance Max tab(s) here`] : [];
  return {
    format, label: rule.label, approximate: rule.approximate, ready: !missing.length && !over,
    counts, missing, over, overWarnings, translationApproval: ta, review: rv,
    destinationMissing: !opts.destinationConfirmed, ctaMissing: format !== 'search' && !opts.cta, workbookNotes,
  };
}
