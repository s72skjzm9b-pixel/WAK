// Collections: copy that can meaningfully be reviewed together. Built from the Sheet's existing
// campaign-tab mappings (campaign → group → source ID). A collection is NOT a Google campaign; several
// campaigns may reference the same source copy. Rules keep local messaging, language and pairing
// boundaries: e.g. New York cafés and Danish cafés are separate, and fixed brand pairs stay pairs.
import type { CampaignFormat, Lang, ParsedWorkbook } from '../workbook/types';
import type { CopyItem } from './library';

export interface CollectionGroup {
  campaign: string;
  group: string;
  format: CampaignFormat;
  language: Lang;
  market: string;
  sourceIds: string[]; // membership, in Sheet order
  signature: string; // groups with identical membership/format/language preview identically
}

export interface Collection {
  key: string;
  name: string;
  intent: string; // customer intent
  audience: string; // audience location / scope
  destination: string;
  destinationConfirmed: boolean;
  note: string | null; // one short, relevant caution
  languages: Lang[]; // languages with campaign mappings
  markets: Partial<Record<Lang, string[]>>;
  formats: Partial<Record<Lang, CampaignFormat[]>>;
  groups: CollectionGroup[];
  sourceIds: string[];
  pairing: boolean; // fixed headline–description pairs
  previewable: boolean;
}

interface Rule {
  key: string; name: string; intent: string; audience: string; note?: string; pairing?: boolean;
  match: (campaign: string, group: string) => boolean;
  mapRow?: RegExp; // Campaign map row used for destination
}

const MARKET_NAME: Record<string, string> = { US: 'US', UK: 'UK', EU: 'EU', DK: 'Denmark', DE: 'Germany', NY: 'New York' };

// Order = navigator order. Matching uses group names and campaign-name conventions from the Sheet.
const RULES: Rule[] = [
  { key: 'online-coffee', name: 'Online Coffee', intent: 'Buying coffee online', audience: 'Eligible online markets', note: 'Market availability to confirm',
    match: (_c, g) => /coffee/i.test(g) && !/brand/i.test(g), mapRow: /_PMX_(NCA|Evergreen)$/ },
  { key: 'subscriptions', name: 'Subscriptions', intent: 'Starting a coffee subscription', audience: 'Eligible subscription markets', note: 'Subscription availability to confirm',
    match: (_c, g) => /subscription/i.test(g), mapRow: /_DG_/ },
  { key: 'new-york-cafes', name: 'New York Cafés', intent: 'Finding or visiting a café', audience: 'People near La Cabra New York',
    match: (c, g) => /^NY_/.test(c) && /caf/i.test(g), mapRow: /^NY_.*Local/ },
  { key: 'danish-cafes', name: 'Danish Cafés', intent: 'Finding or visiting a café', audience: 'People near a La Cabra café in Denmark',
    match: (c, g) => /^DK_.*Local/.test(c) && /caf/i.test(g), mapRow: /^DK_.*Local/ },
  { key: 'cafe-search', name: 'Café visits in brand Search', intent: 'Finding or visiting a café', audience: 'Relevant café locations only', note: 'Only where a café is relevant to the search',
    match: (c, g) => /_SNO_/.test(c) && /caf/i.test(g), mapRow: /_SNO_/ },
  { key: 'brand-stories', name: 'Brand stories', intent: 'Getting to know La Cabra', audience: 'Shared brand support, selected per campaign', pairing: true,
    note: 'Each headline keeps its own descriptions', match: (_c, g) => /^brand/i.test(g), mapRow: /_SNO_/ },
];

const unconfirmed = (s: string) => /confirm|pending|unverified|tbc/i.test(s);

export function buildCollections(p: ParsedWorkbook, library: CopyItem[]): Collection[] {
  const out: Collection[] = [];
  const mapped = new Set<string>();
  for (const rule of RULES) {
    const groups: CollectionGroup[] = [];
    for (const c of p.campaigns) {
      const byGroup = new Map<string, string[]>();
      for (const m of c.memberships) if (rule.match(c.name, m.group)) byGroup.set(m.group, [...(byGroup.get(m.group) ?? []), m.sourceId]);
      for (const [group, ids] of byGroup) {
        groups.push({ campaign: c.name, group, format: c.format, language: c.language, market: c.market, sourceIds: ids, signature: `${c.format}|${c.language}|${group}|${ids.join(',')}` });
      }
    }
    if (!groups.length) continue;
    const ids: string[] = [];
    for (const g of groups) for (const id of g.sourceIds) if (!ids.includes(id)) ids.push(id);
    ids.forEach((id) => mapped.add(id));
    const languages = (['EN', 'DK', 'DE'] as Lang[]).filter((l) => groups.some((g) => g.language === l));
    const markets: Collection['markets'] = {}, formats: Collection['formats'] = {};
    for (const l of languages) {
      markets[l] = [...new Set(groups.filter((g) => g.language === l).map((g) => MARKET_NAME[g.market] ?? g.market))];
      formats[l] = [...new Set(groups.filter((g) => g.language === l).map((g) => g.format))];
    }
    const mapRow = p.campaignMap.find((m) => rule.mapRow?.test(m.name)) ?? null;
    const destination = mapRow?.destination ?? '';
    out.push({
      key: rule.key, name: rule.name, intent: rule.intent, audience: rule.audience, destination: describeDestination(destination),
      destinationConfirmed: !!destination && !unconfirmed(destination), note: rule.note ?? null, languages, markets, formats, groups,
      sourceIds: ids, pairing: !!rule.pairing, previewable: true,
    });
  }

  // Copy in the Sheet that no campaign tab uses yet (e.g. short introductions, the proposed “La Cabra” headline).
  const unassigned = library.filter((i) => !i.isTest && !mapped.has(i.sourceId) && !i.usages.length).map((i) => i.sourceId);
  out.push({
    key: 'not-yet-assigned', name: 'Not yet assigned', intent: 'Format and use to be decided', audience: 'Not mapped to any ad group',
    destination: 'Not decided', destinationConfirmed: false, note: 'No ad preview until a format is chosen', languages: [], markets: {}, formats: {},
    groups: [], sourceIds: unassigned, pairing: false, previewable: false,
  });

  // Seasonal workstreams from the Campaign map that have no approved source copy yet.
  for (const m of p.campaignMap.filter((x) => /christmas|advent/i.test(x.name))) {
    const isAdvent = /advent/i.test(m.name);
    out.push({
      key: isAdvent ? 'advent' : 'christmas', name: isAdvent ? 'Advent calendar' : 'Christmas', intent: m.intent, audience: 'Markets to confirm',
      destination: describeDestination(m.destination), destinationConfirmed: false, note: 'No approved seasonal copy yet', languages: [], markets: {}, formats: {},
      groups: [], sourceIds: [], pairing: false, previewable: false,
    });
  }
  return out;
}

function describeDestination(d: string): string {
  if (!d) return 'Not set';
  if (/separate local/i.test(d)) return 'Shop or café page, by intent';
  if (/subscription/i.test(d)) return 'Subscription page';
  if (/café|cafe/i.test(d)) return 'Café page';
  if (/shop/i.test(d)) return 'Coffee shop page';
  if (/product/i.test(d)) return 'Product page';
  return d;
}

/** Which collection a legacy “variation” draft belongs to (it stored campaign/group targets). */
export function collectionForTargets(cols: Collection[], targets: { campaign: string; group: string }[] | undefined): string | null {
  for (const t of targets ?? []) {
    const c = cols.find((x) => x.groups.some((g) => g.campaign === t.campaign && g.group === t.group));
    if (c) return c.key;
  }
  return null;
}
