// Character limits and format rules. Each value records where it was checked.
// Verified 2026-11-16 against Google Ads Help as quoted in search results; support.google.com itself
// was not reachable from the build environment, so re-check the linked pages before launch.
import type { CampaignFormat } from '@/server/workbook/types';

export interface FieldLimit { max: number; source: string; verified: boolean; note?: string }
export interface FormatSpec {
  format: CampaignFormat;
  label: string;
  pinning: boolean;
  fields: Record<string, FieldLimit>; // keyed by normalised asset type
  counts: string;
  notes: string[];
}

const RSA = 'Google Ads Help — About responsive search ads (support.google.com/google-ads/answer/7684791)';
const PMAX = 'Google Ads Help — Performance Max specs (support.google.com/google-ads/answer/17091269, /13676244)';

export const FORMAT_SPECS: Record<Exclude<CampaignFormat, 'unknown'>, FormatSpec> = {
  search: {
    format: 'search', label: 'Search — responsive search ad', pinning: true,
    fields: {
      headline: { max: 30, source: RSA, verified: true },
      description: { max: 90, source: RSA, verified: true },
      path: { max: 15, source: RSA, verified: true },
    },
    counts: '3–15 headlines, 2–4 descriptions per ad.',
    notes: [
      'Pins: headline positions 1–3 and description positions 1–2. Google advises pinning reduces the combinations it can test.',
      'Text pinned to Headline 3 or Description 2 is not guaranteed to show.',
      'Several assets pinned to the same position rotate in that position — pinning alone does not keep exact pairs together.',
    ],
  },
  pmax: {
    format: 'pmax', label: 'Performance Max — asset group text', pinning: false,
    fields: {
      headline: { max: 30, source: PMAX, verified: true, note: 'Include at least one headline of 15 characters or fewer.' },
      'long headline': { max: 90, source: PMAX, verified: true },
      description: { max: 90, source: PMAX, verified: true, note: 'At least one shorter description is required; Google pages disagree on 60 vs 30 characters — confirm before launch.' },
      'business name': { max: 25, source: PMAX, verified: true },
    },
    counts: '3–15 headlines, 1–5 long headlines, 2–5 descriptions per asset group.',
    notes: ['No Search-style pinning: every asset must read well in any combination within its asset group.'],
  },
  demand_gen: {
    format: 'demand_gen', label: 'Demand Gen', pinning: false,
    fields: {
      headline: { max: 40, source: 'Not verified in this release', verified: false },
      description: { max: 90, source: 'Not verified in this release', verified: false },
      'long headline': { max: 90, source: 'Not verified in this release', verified: false },
    },
    counts: 'Not verified in this release.',
    notes: ['Demand Gen limits were not verified against Google documentation during implementation. Treat as provisional.'],
  },
};

export function normAssetType(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function limitFor(assetType: string, format: CampaignFormat): FieldLimit | null {
  if (format === 'unknown') return null;
  return FORMAT_SPECS[format].fields[normAssetType(assetType)] ?? null;
}

/** Google counts characters; for Latin scripts that is one per character. Count by code points. */
export function charCount(text: string): number {
  return [...text].length;
}

export interface Validation { level: 'error' | 'warning' | 'info'; message: string }

export function validateText(text: string, assetType: string, formats: CampaignFormat[]): Validation[] {
  const out: Validation[] = [];
  const n = charCount(text);
  if (!text.trim()) out.push({ level: 'error', message: 'Wording is empty.' });
  if (text !== text.trim()) out.push({ level: 'warning', message: 'Leading or trailing spaces.' });
  if (/\s{2,}/.test(text)) out.push({ level: 'warning', message: 'Double spaces.' });
  if (/^[=+\-@]/.test(text)) out.push({ level: 'warning', message: 'Starts with =, +, - or @ — it will be written as plain text, never as a formula.' });
  if (/!{1,}/.test(text) && normAssetType(assetType) === 'headline') out.push({ level: 'warning', message: 'Google does not allow exclamation marks in headlines.' });
  const seen = new Set<string>();
  for (const f of formats) {
    if (seen.has(f)) continue; seen.add(f);
    const lim = limitFor(assetType, f);
    if (!lim) continue;
    const label = FORMAT_SPECS[f as Exclude<CampaignFormat, 'unknown'>].label;
    if (n > lim.max) out.push({ level: 'error', message: `${n}/${lim.max} characters — too long for ${label}${lim.verified ? '' : ' (provisional limit)'}.` });
  }
  if (!formats.length || formats.every((f) => !limitFor(assetType, f))) {
    out.push({ level: 'info', message: `No verified character limit applies (asset type “${assetType || 'unassigned'}”, format not assigned).` });
  }
  return out;
}
