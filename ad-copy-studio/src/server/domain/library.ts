// Builds the copy library (one entry per source ID, with its three language versions and where it is
// used) from a parsed workbook. Pure: no I/O.
import crypto from 'node:crypto';
import type { CampaignFormat, Lang, ParsedWorkbook, SourceRow } from '../workbook/types';
import { config } from '../config';

export function fp(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

export const INTENT_GROUPS = [
  { key: 'online', label: 'Online coffee shopping' },
  { key: 'subscription', label: 'Subscriptions' },
  { key: 'local_cafe', label: 'Local café visits' },
  { key: 'ny_cafe', label: 'New York café messaging' },
  { key: 'dk_cafe', label: 'Danish café messaging' },
  { key: 'christmas', label: 'Christmas products' },
  { key: 'advent', label: 'Advent calendars' },
  { key: 'brand', label: 'Shared brand support (select deliberately)' },
] as const;
export type IntentKey = (typeof INTENT_GROUPS)[number]['key'];

export interface Usage {
  campaign: string;
  group: string;
  format: CampaignFormat;
  market: string;
  language: Lang;
  assetType: string;
}

export interface LangVersion {
  lang: Lang;
  text: string;
  fp: string;
  sheetStatus: string; // status text shown in the Sheet (not an approval)
  ref: { tab: string; row: number; col: number } | null; // where the canonical wording lives
}

export interface CopyItem {
  sourceId: string;
  isTest: boolean;
  theme: string;
  assetType: string;
  linkedHeadline: string | null;
  /** Stable pairing: the source ID of the headline this description must appear with. */
  linkedHeadlineId: string | null;
  intent: string;
  scope: string;
  destination: string;
  usageRule: string;
  sheetStatus: string;
  shortened: string;
  note: string;
  versions: Record<Lang, LangVersion>;
  usages: Usage[];
  intents: IntentKey[];
}

export function isTestId(id: string) {
  return id.toUpperCase().startsWith(config.testIdPrefix);
}

function intentsFor(s: SourceRow, usages: Usage[]): IntentKey[] {
  const i = s.intent.toLowerCase();
  const out = new Set<IntentKey>();
  if (i.includes('online')) out.add('online');
  if (i.includes('subscription')) out.add('subscription');
  if (i.includes('café') || i.includes('cafe')) {
    out.add('local_cafe');
    if (/new york/i.test(s.scope)) out.add('ny_cafe');
    if (usages.some((u) => u.market === 'NY' && /local/i.test(u.campaign))) out.add('ny_cafe');
    if (usages.some((u) => u.market === 'DK' && /local/i.test(u.campaign))) out.add('dk_cafe');
  }
  if (i.includes('brand') || i.includes('introduction')) out.add('brand');
  if (/christmas/i.test(s.theme + s.intent)) out.add('christmas');
  if (/advent/i.test(s.theme + s.intent)) out.add('advent');
  return [...out];
}

export function buildLibrary(p: ParsedWorkbook): CopyItem[] {
  const tr = new Map(p.translations.map((t) => [t.sourceId, t]));
  return p.source.map((s) => {
    const t = tr.get(s.sourceId);
    const usages: Usage[] = [];
    for (const c of p.campaigns) for (const m of c.memberships) {
      if (m.sourceId === s.sourceId) usages.push({ campaign: c.name, group: m.group, format: c.format, market: c.market, language: c.language, assetType: m.assetType });
    }
    const linked = s.linkedHeadline && !/section-level|unassigned/i.test(s.linkedHeadline) ? s.linkedHeadline : null;
    const heads = linked ? p.source.filter((h) => h.sourceId !== s.sourceId && /headline/i.test(h.assetType) && h.english === linked) : [];
    const linkedId = (heads.find((h) => h.theme === s.theme) ?? heads[0])?.sourceId ?? null;
    const v = (lang: Lang, text: string, status: string, ref: LangVersion['ref']): LangVersion => ({ lang, text, fp: fp(text), sheetStatus: status, ref });
    return {
      sourceId: s.sourceId, isTest: isTestId(s.sourceId), theme: s.theme, assetType: s.assetType, linkedHeadline: linked, linkedHeadlineId: linkedId,
      intent: s.intent, scope: s.scope, destination: s.destination, usageRule: s.usageRule, sheetStatus: s.status,
      shortened: s.shortened, note: t?.note ?? '',
      versions: {
        EN: v('EN', s.english, s.status, p.sourceCols.english ? { tab: 'Source copy', row: s.row, col: p.sourceCols.english.index } : null),
        DK: v('DK', t?.dk ?? '', t?.dkStatus ?? 'No Translation review row', t && p.translationCols.dk ? { tab: 'Translation review', row: t.row, col: p.translationCols.dk.index } : null),
        DE: v('DE', t?.de ?? '', t?.deStatus ?? 'No Translation review row', t && p.translationCols.de ? { tab: 'Translation review', row: t.row, col: p.translationCols.de.index } : null),
      },
      usages,
      intents: intentsFor(s, usages),
    };
  });
}
