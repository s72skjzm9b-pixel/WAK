// Shapes produced by reading the workbook. Pure data — no Google or database code here.

export type Lang = 'EN' | 'DK' | 'DE';
export const LANGS: Lang[] = ['EN', 'DK', 'DE'];
export const LANG_LABEL: Record<Lang, string> = { EN: 'English', DK: 'Danish', DE: 'German' };

/** Raw grid as read from Google (formatted values), a snapshot file or the sandbox. Row 1 = index 0. */
export interface RawTab {
  sheetId: number;
  values: string[][];
}
export interface RawWorkbook {
  spreadsheetId: string;
  title: string;
  tabs: Record<string, RawTab>;
  readAt: string;
  origin: 'google' | 'snapshot' | 'sandbox';
  limitations?: string[];
}

/** A discovered column: header text and 0-based index. */
export interface Col {
  header: string;
  index: number;
  letter: string;
}

export interface SourceRow {
  sourceId: string;
  row: number; // 1-based sheet row
  theme: string;
  assetType: string;
  linkedHeadline: string; // "Section-level only", "Unassigned" or the linked headline text
  english: string;
  shortened: string;
  status: string;
  intent: string;
  scope: string;
  destination: string;
  usageRule: string;
}

export interface TranslationRow {
  sourceId: string;
  row: number;
  family: string;
  englishShown: string; // column C (formula → Source copy)
  dk: string;
  dkStatus: string;
  de: string;
  deStatus: string;
  note: string;
}

export interface ChangeRefRow {
  sourceId: string;
  lang: Lang;
  row: number;
  previous: string; // C — saved reference
  current: string; // D — formula
  englishAtRef: string; // E — saved reference
  currentEnglish: string; // F — formula
  textChange: string; // G — formula
  translationCheck: string; // H — formula
  approvedReplacement: string; // I — value
  approvedEnglish: string; // J — value
  action: string; // K — formula
  campaignRefs: string; // L
}

export type CampaignFormat = 'search' | 'pmax' | 'demand_gen' | 'unknown';

export interface CampaignMembership {
  campaign: string;
  group: string;
  assetType: string;
  sourceId: string;
  row: number;
  shownText: string; // what the campaign tab displays (formula result)
}

export interface CampaignAlternative {
  campaign: string;
  group: string;
  assetType: string;
  text: string;
  status: string;
  note: string;
  row: number;
}

export interface CampaignGap {
  campaign: string;
  group: string;
  assetType: string;
  note: string;
  row: number;
}

export interface CampaignTab {
  name: string;
  sheetId: number;
  market: string; // US, NY, DK, UK, EU, DE …
  format: CampaignFormat;
  language: Lang;
  copyCol: Col | null;
  memberships: CampaignMembership[];
  alternatives: CampaignAlternative[];
  gaps: CampaignGap[];
}

export interface CampaignMapRow {
  name: string;
  intent: string;
  marketLanguage: string;
  destination: string;
  allowedSource: string;
  rule: string;
  decision: string;
  row: number;
}

export interface MappingCheck {
  tab: string;
  field: string;
  expected: string; // expected column letter from the brief
  found: string | null; // discovered letter
  header: string | null;
  ok: boolean;
}

export interface ParsedWorkbook {
  raw: RawWorkbook;
  tabsFound: string[];
  missingTabs: string[];
  source: SourceRow[];
  sourceCols: Record<string, Col>;
  sourceHeaderRow: number;
  translations: TranslationRow[];
  translationCols: Record<string, Col>;
  changeRef: ChangeRefRow[];
  changeRefCols: Record<string, Col>;
  updatesRows: ChangeRefRow[]; // what "Updates for Anabelle" currently lists
  updatesEmptyMessage: string | null;
  campaigns: CampaignTab[];
  campaignMap: CampaignMapRow[];
  mappingChecks: MappingCheck[];
  warnings: string[];
}
