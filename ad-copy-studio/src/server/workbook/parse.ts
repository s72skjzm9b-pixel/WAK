// Header-driven workbook parser. Never assumes row numbers or tab order: it locates tabs by
// title, header rows by the "SOURCE ID" header, and columns by header text. It then reports how
// the discovered layout compares with the column letters documented in the brief.
import type {
  CampaignFormat, CampaignTab, ChangeRefRow, Col, Lang, MappingCheck, ParsedWorkbook, RawWorkbook,
  SourceRow, TranslationRow, CampaignMapRow,
} from './types';

export const TAB = {
  start: 'Start here',
  campaignMap: 'Campaign map',
  source: 'Source copy',
  translation: 'Translation review',
  examples: 'Ad examples',
  pmaxCombos: 'PMax combinations',
  updates: 'Updates for Anabelle',
  changeRef: 'Change reference',
  structure: 'Proposed structure',
} as const;

export function colLetter(index: number): string {
  let n = index + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const cell = (row: string[] | undefined, c: Col | undefined) => (c && row ? (row[c.index] ?? '') : '');

function findTab(raw: RawWorkbook, title: string): string | null {
  if (raw.tabs[title]) return title;
  const t = Object.keys(raw.tabs).find((k) => norm(k) === norm(title));
  return t ?? null;
}

/** Finds the first row (within the first 15) whose cells include every required header. */
function findHeaderRow(values: string[][], required: RegExp[]): number {
  for (let r = 0; r < Math.min(15, values.length); r++) {
    const row = (values[r] ?? []).map(norm);
    if (required.every((re) => row.some((h) => re.test(h)))) return r;
  }
  return -1;
}

function mapCols(header: string[], spec: Record<string, RegExp>): Record<string, Col> {
  const out: Record<string, Col> = {};
  const used = new Set<number>();
  for (const [key, re] of Object.entries(spec)) {
    const idx = header.findIndex((h, i) => !used.has(i) && re.test(norm(h)));
    if (idx >= 0) { used.add(idx); out[key] = { header: header[idx], index: idx, letter: colLetter(idx) }; }
  }
  return out;
}

const SOURCE_SPEC: Record<string, RegExp> = {
  id: /^SOURCE ID$/, theme: /^THEME/, type: /^TYPE$|^ASSET TYPE$/, linked: /LINKED HEADLINE/,
  english: /ORIGINAL COPY|ENGLISH (WORDING|COPY)/, chars: /^CHAR/, shortened: /SHORTENED/, status: /^STATUS/,
  intent: /CUSTOMER INTENT/, scope: /SCOPE/, destination: /DESTINATION/, usage: /USAGE|APPROVAL RULE/,
};
const SOURCE_EXPECT: Record<string, string> = {
  id: 'A', theme: 'B', type: 'C', linked: 'D', english: 'E', chars: 'F', shortened: 'G', status: 'H',
  intent: 'I', scope: 'J', destination: 'K', usage: 'L',
};
const TR_SPEC: Record<string, RegExp> = {
  id: /^SOURCE ID$/, family: /FAMILY/, english: /ENGLISH/, dk: /DANISH/, dkStatus: /^DK /, de: /GERMAN/,
  deStatus: /^DE /, note: /NOTE/,
};
const TR_EXPECT: Record<string, string> = { id: 'A', family: 'B', english: 'C', dk: 'D', dkStatus: 'E', de: 'F', deStatus: 'G', note: 'H' };
const CR_SPEC: Record<string, RegExp> = {
  id: /^SOURCE ID$/, lang: /^LANGUAGE$/, previous: /PREVIOUS/, current: /^CURRENT WORDING/, englishAtRef: /ENGLISH AT REF/,
  currentEnglish: /^CURRENT ENGLISH/, textChange: /TEXT CHANGE/, translationCheck: /TRANSLATION CHECK/,
  approvedReplacement: /APPROVED REPLACEMENT/, approvedEnglish: /APPROVED ENGLISH/, action: /^ACTION/, refs: /CAMPAIGN REF/,
};
const CR_EXPECT: Record<string, string> = {
  id: 'A', lang: 'B', previous: 'C', current: 'D', englishAtRef: 'E', currentEnglish: 'F', textChange: 'G',
  translationCheck: 'H', approvedReplacement: 'I', approvedEnglish: 'J', action: 'K', refs: 'L',
};

function checks(tab: string, cols: Record<string, Col>, expect: Record<string, string>): MappingCheck[] {
  return Object.entries(expect).map(([field, letter]) => ({
    tab, field, expected: letter, found: cols[field]?.letter ?? null, header: cols[field]?.header ?? null,
    ok: cols[field]?.letter === letter,
  }));
}

export function toLang(s: string): Lang | null {
  const v = norm(s);
  if (v === 'EN' || v === 'ENGLISH') return 'EN';
  if (v === 'DK' || v === 'DA' || v === 'DANISH') return 'DK';
  if (v === 'DE' || v === 'GERMAN') return 'DE';
  return null;
}

function campaignFormat(name: string): CampaignFormat {
  const parts = name.toUpperCase().split('_');
  if (parts.includes('SNO') || parts.includes('SEARCH')) return 'search';
  if (parts.includes('PMX') || parts.includes('PMAX')) return 'pmax';
  if (parts.includes('DG')) return 'demand_gen';
  return 'unknown';
}

export function isSourceId(v: string): boolean {
  return /^[A-Z]{1,6}-?\d{1,4}$/i.test(v.trim());
}

export function parseWorkbook(raw: RawWorkbook): ParsedWorkbook {
  const warnings: string[] = [];
  const mappingChecks: MappingCheck[] = [];
  const tabsFound = Object.keys(raw.tabs);
  const missingTabs = Object.values(TAB).filter((t) => !findTab(raw, t));

  // ---------- Source copy
  const source: SourceRow[] = [];
  let sourceCols: Record<string, Col> = {};
  let sourceHeaderRow = -1;
  const srcTab = findTab(raw, TAB.source);
  if (srcTab) {
    const v = raw.tabs[srcTab].values;
    sourceHeaderRow = findHeaderRow(v, [/^SOURCE ID$/, /ORIGINAL COPY|ENGLISH/]);
    if (sourceHeaderRow < 0) warnings.push('Source copy: header row with SOURCE ID not found.');
    else {
      sourceCols = mapCols(v[sourceHeaderRow], SOURCE_SPEC);
      mappingChecks.push(...checks(TAB.source, sourceCols, SOURCE_EXPECT));
      for (let r = sourceHeaderRow + 1; r < v.length; r++) {
        const row = v[r];
        const id = cell(row, sourceCols.id).trim();
        if (!id || !isSourceId(id)) continue;
        source.push({
          sourceId: id, row: r + 1, theme: cell(row, sourceCols.theme), assetType: cell(row, sourceCols.type),
          linkedHeadline: cell(row, sourceCols.linked), english: cell(row, sourceCols.english),
          shortened: cell(row, sourceCols.shortened), status: cell(row, sourceCols.status),
          intent: cell(row, sourceCols.intent), scope: cell(row, sourceCols.scope),
          destination: cell(row, sourceCols.destination), usageRule: cell(row, sourceCols.usage),
        });
      }
      const dup = dupes(source.map((s) => s.sourceId));
      if (dup.length) warnings.push(`Source copy: duplicate source IDs ${dup.join(', ')} — writes for these IDs are blocked.`);
    }
  }

  // ---------- Translation review
  const translations: TranslationRow[] = [];
  let translationCols: Record<string, Col> = {};
  const trTab = findTab(raw, TAB.translation);
  if (trTab) {
    const v = raw.tabs[trTab].values;
    const h = findHeaderRow(v, [/^SOURCE ID$/, /DANISH/, /GERMAN/]);
    if (h < 0) warnings.push('Translation review: header row not found.');
    else {
      translationCols = mapCols(v[h], TR_SPEC);
      mappingChecks.push(...checks(TAB.translation, translationCols, TR_EXPECT));
      for (let r = h + 1; r < v.length; r++) {
        const row = v[r];
        const id = cell(row, translationCols.id).trim();
        if (!id || !isSourceId(id)) continue;
        translations.push({
          sourceId: id, row: r + 1, family: cell(row, translationCols.family), englishShown: cell(row, translationCols.english),
          dk: cell(row, translationCols.dk), dkStatus: cell(row, translationCols.dkStatus),
          de: cell(row, translationCols.de), deStatus: cell(row, translationCols.deStatus), note: cell(row, translationCols.note),
        });
      }
    }
  }

  // ---------- Change reference + Updates for Anabelle (same column layout)
  const parseRefGrid = (tabName: string, collectChecks: boolean) => {
    const rows: ChangeRefRow[] = [];
    let cols: Record<string, Col> = {};
    let emptyMessage: string | null = null;
    const t = findTab(raw, tabName);
    if (!t) return { rows, cols, emptyMessage };
    const v = raw.tabs[t].values;
    const h = findHeaderRow(v, [/^SOURCE ID$/, /^LANGUAGE$/]);
    if (h < 0) { warnings.push(`${tabName}: header row not found.`); return { rows, cols, emptyMessage }; }
    cols = mapCols(v[h], CR_SPEC);
    if (collectChecks) mappingChecks.push(...checks(tabName, cols, CR_EXPECT));
    for (let r = h + 1; r < v.length; r++) {
      const row = v[r];
      const id = cell(row, cols.id).trim();
      if (!id) continue;
      const lang = toLang(cell(row, cols.lang));
      if (!isSourceId(id) || !lang) { if (r === h + 1) emptyMessage = id; continue; }
      rows.push({
        sourceId: id, lang, row: r + 1, previous: cell(row, cols.previous), current: cell(row, cols.current),
        englishAtRef: cell(row, cols.englishAtRef), currentEnglish: cell(row, cols.currentEnglish),
        textChange: cell(row, cols.textChange), translationCheck: cell(row, cols.translationCheck),
        approvedReplacement: cell(row, cols.approvedReplacement), approvedEnglish: cell(row, cols.approvedEnglish),
        action: cell(row, cols.action), campaignRefs: cell(row, cols.refs),
      });
    }
    return { rows, cols, emptyMessage };
  };
  const cr = parseRefGrid(TAB.changeRef, true);
  const up = parseRefGrid(TAB.updates, false);

  // ---------- Campaign tabs: any tab whose header has GROUP / SECTION + ASSET TYPE + SOURCE ID
  const campaigns: CampaignTab[] = [];
  for (const name of tabsFound) {
    const v = raw.tabs[name].values;
    const h = findHeaderRow(v, [/^GROUP/, /^ASSET TYPE$/, /^SOURCE ID$/]);
    if (h < 0) continue;
    const header = v[h];
    const cols = mapCols(header, {
      group: /^GROUP/, type: /^ASSET TYPE$/, id: /^SOURCE ID$/,
      copy: /(SOURCE|DANISH|GERMAN|LOCAL) COPY/, alt: /ALTERNATIVE/, status: /STATUS/, pairing: /PAIRING|NEXT STEP/,
    });
    const copyHeader = norm(cols.copy?.header);
    const language: Lang = copyHeader.includes('DANISH') ? 'DK' : copyHeader.includes('GERMAN') ? 'DE' : 'EN';
    const tab: CampaignTab = {
      name, sheetId: raw.tabs[name].sheetId, market: name.split('_')[0].toUpperCase(), format: campaignFormat(name),
      language, copyCol: cols.copy ?? null, memberships: [], alternatives: [], gaps: [],
    };
    for (let r = h + 1; r < v.length; r++) {
      const row = v[r];
      const group = cell(row, cols.group).trim();
      const assetType = cell(row, cols.type).trim();
      const id = cell(row, cols.id).trim();
      if (!group && !assetType && !id) continue;
      if (id && isSourceId(id)) {
        tab.memberships.push({ campaign: name, group, assetType, sourceId: id, row: r + 1, shownText: cell(row, cols.copy) });
      } else if (cell(row, cols.alt).trim()) {
        tab.alternatives.push({ campaign: name, group, assetType, text: cell(row, cols.alt).trim(), status: cell(row, cols.status), note: cell(row, cols.pairing), row: r + 1 });
      } else if (/missing/i.test(group) || /needs source/i.test(cell(row, cols.status))) {
        tab.gaps.push({ campaign: name, group, assetType, note: cell(row, cols.pairing) || cell(row, cols.status), row: r + 1 });
      }
    }
    campaigns.push(tab);
  }

  // ---------- Campaign map
  const campaignMap: CampaignMapRow[] = [];
  const cmTab = findTab(raw, TAB.campaignMap);
  if (cmTab) {
    const v = raw.tabs[cmTab].values;
    const h = findHeaderRow(v, [/^CAMPAIGN/, /^CUSTOMER INTENT$/]);
    if (h >= 0) {
      const c = mapCols(v[h], {
        name: /CAMPAIGN/, intent: /INTENT/, market: /MARKET/, destination: /DESTINATION/, allowed: /ALLOWED/,
        rule: /RULE|PINNING/, decision: /DECISION|APPROVAL/,
      });
      for (let r = h + 1; r < v.length; r++) {
        const row = v[r];
        const name = cell(row, c.name).trim();
        if (!name) continue;
        campaignMap.push({
          name, intent: cell(row, c.intent), marketLanguage: cell(row, c.market), destination: cell(row, c.destination),
          allowedSource: cell(row, c.allowed), rule: cell(row, c.rule), decision: cell(row, c.decision), row: r + 1,
        });
      }
    }
  }

  // Integrity checks between tabs.
  const ids = new Set(source.map((s) => s.sourceId));
  for (const t of translations) if (!ids.has(t.sourceId)) warnings.push(`Translation review lists ${t.sourceId}, which is not in Source copy.`);
  for (const s of source) if (!translations.some((t) => t.sourceId === s.sourceId)) warnings.push(`${s.sourceId} has no Translation review row.`);
  for (const s of source) for (const l of ['EN', 'DK', 'DE'] as Lang[]) {
    if (!cr.rows.some((r) => r.sourceId === s.sourceId && r.lang === l)) warnings.push(`${s.sourceId}/${l} has no Change reference row — changes to it will not appear in Updates for Anabelle.`);
  }
  for (const c of campaigns) for (const m of c.memberships) if (!ids.has(m.sourceId)) warnings.push(`${c.name} row ${m.row} refers to unknown source ID ${m.sourceId}.`);

  return {
    raw, tabsFound, missingTabs, source, sourceCols, sourceHeaderRow, translations, translationCols,
    changeRef: cr.rows, changeRefCols: cr.cols, updatesRows: up.rows, updatesEmptyMessage: up.emptyMessage,
    campaigns, campaignMap, mappingChecks, warnings,
  };
}

function dupes(list: string[]): string[] {
  const seen = new Set<string>(), d = new Set<string>();
  for (const x of list) (seen.has(x) ? d : seen).add(x);
  return [...d];
}
