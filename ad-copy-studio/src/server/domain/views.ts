// Read models for the screens. Keeps the four wording states distinct:
//   1. current Sheet wording  2. proposed revision  3. approved revision  4. revision written to the Sheet
import type { Lang } from '../workbook/types';
import type { Studio } from './studio';
import { INTENT_GROUPS, type CopyItem } from './library';
import type { PoolAsset, GroupContext, PinPosition } from '@/lib/combos';
import { FORMAT_SPECS } from '@/lib/limits';
import { config } from '../config';
import { authStatus } from '../google/auth';
import type { Revision } from '../store/repo';

export function revisionSummary(r: Revision) {
  return {
    id: r.id, kind: r.kind, sourceId: r.sourceId, language: r.language, baseText: r.baseText, proposedText: r.proposedText,
    englishBasis: r.englishBasis, reason: r.reason, meta: r.meta, state: r.state, syncState: r.syncState, syncDetail: r.syncDetail,
    isTest: r.isTest, createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export async function libraryView(studio: Studio) {
  const wb = await studio.workbook();
  const revs = studio.repo.listRevisions();
  const items = wb.library.map((item) => {
    const langs = {} as Record<Lang, any>;
    for (const l of ['EN', 'DK', 'DE'] as Lang[]) {
      const v = item.versions[l];
      const mine = revs.filter((r) => r.sourceId === item.sourceId && r.language === l && !['withdrawn', 'superseded'].includes(r.state));
      const approval = studio.currentWordingApproval(item, l);
      const englishChanging = l !== 'EN' && revs.some((r) => r.sourceId === item.sourceId && r.language === 'EN' && r.kind === 'replace' && ['submitted', 'approved'].includes(r.state));
      langs[l] = {
        text: v.text, sheetStatus: v.sheetStatus, approvedAsIs: !!approval, approvalId: approval?.id ?? null,
        recheck: /recheck/i.test(v.sheetStatus), englishChanging,
        open: mine.filter((r) => r.state !== 'written').map(revisionSummary),
        writtenUnacknowledged: mine.filter((r) => r.state === 'written').map(revisionSummary).slice(0, 3),
      };
    }
    return {
      sourceId: item.sourceId, isTest: item.isTest, theme: item.theme, assetType: item.assetType, linkedHeadline: item.linkedHeadline,
      intent: item.intent, scope: item.scope, destination: item.destination, usageRule: item.usageRule, sheetStatus: item.sheetStatus,
      shortened: item.shortened, note: item.note, usages: item.usages, intents: item.intents, langs,
    };
  });
  const variations = revs.filter((r) => r.kind === 'variation' && !['withdrawn', 'superseded'].includes(r.state)).map(revisionSummary);
  const p = wb.parsed;
  return {
    readAt: wb.readAt, origin: wb.origin, mode: studio.mode(), intentGroups: INTENT_GROUPS,
    items, variations,
    campaigns: p.campaigns.map((c) => ({
      name: c.name, market: c.market, format: c.format, language: c.language,
      groups: [...new Set(c.memberships.map((m) => m.group))],
      alternatives: c.alternatives, gaps: c.gaps,
    })),
    campaignMap: p.campaignMap,
    suggestedNewId: studio.suggestNewId(wb.library),
  };
}

/** Assets for one campaign group, in that campaign's language, optionally with proposals overlaid. */
export async function groupContext(studio: Studio, campaign: string, group: string, opts: { overlay: boolean }) {
  const wb = await studio.workbook();
  const c = wb.parsed.campaigns.find((x) => x.name === campaign);
  if (!c) return null;
  const byId = new Map(wb.library.map((i) => [i.sourceId, i]));
  const revs = opts.overlay ? studio.repo.listRevisions({ states: ['submitted', 'approved'] }) : [];
  const assets: PoolAsset[] = [];
  for (const m of c.memberships.filter((x) => x.group === group)) {
    const item = byId.get(m.sourceId);
    if (!item || item.isTest) continue;
    const text = item.versions[c.language].text;
    const proposal = revs.find((r) => r.kind === 'replace' && r.sourceId === m.sourceId && r.language === c.language);
    if (proposal) assets.push({ sourceId: m.sourceId, assetType: m.assetType, text: proposal.proposedText, linkedHeadline: item.linkedHeadline, state: 'proposed', label: proposal.state === 'approved' ? 'Approved, not yet in Sheet' : 'Proposed revision' });
    else if (!text) assets.push({ sourceId: m.sourceId, assetType: m.assetType, text: '', linkedHeadline: item.linkedHeadline, state: 'missing', label: `No ${c.language} wording yet` });
    else assets.push({ sourceId: m.sourceId, assetType: m.assetType, text, linkedHeadline: item.linkedHeadline, state: 'sheet' });
  }
  if (opts.overlay) {
    for (const v of revs.filter((r) => r.kind === 'variation' && r.language === c.language && (r.meta.targets ?? []).some((t) => t.campaign === campaign && t.group === group))) {
      assets.push({ sourceId: v.sourceId, assetType: v.meta.assetType ?? 'Headline', text: v.proposedText, linkedHeadline: v.meta.linkedHeadline ?? null, state: 'proposed', label: 'New variation (proposed)' });
    }
  }
  const englishHeadlines: Record<string, string> = {};
  for (const i of wb.library) englishHeadlines[i.sourceId] = i.versions.EN.text;
  const ctx: GroupContext = {
    campaign, group, format: c.format, language: c.language, assets,
    pins: c.format === 'search' ? (studio.repo.pins(campaign, group) as Record<string, PinPosition>) : {},
  };
  const mapRow = wb.parsed.campaignMap.find((m) => m.name === campaign) ?? null;
  return { ctx, englishHeadlines, gaps: c.gaps.filter((g) => !g.group || true), mapRow };
}

export async function statusView(studio: Studio) {
  const mode = studio.mode();
  const gw = studio.gateway();
  const last = studio.repo.lastRead(mode);
  let wb: Awaited<ReturnType<Studio['workbook']>> | null = null;
  let wbError: string | null = null;
  try { wb = await studio.workbook(); } catch (e) { wbError = e instanceof Error ? e.message : String(e); }
  const raw = wb?.parsed.raw;
  return {
    mode, canWrite: gw.canWrite, gatewayLabel: gw.describe(),
    auth: authStatus(), googleAuthMode: config.googleAuthMode, googleAccess: config.googleAccess,
    spreadsheetId: config.spreadsheetId, dataDir: config.dataDir,
    lastRead: last ? { at: last.finished_at ?? last.started_at, ok: !!last.ok, errorKind: last.error_kind, errorMessage: last.error_message } : null,
    workbook: wb ? {
      title: raw?.title, readAt: wb.readAt, origin: wb.origin, limitations: raw?.limitations ?? [],
      tabsFound: wb.parsed.tabsFound, missingTabs: wb.parsed.missingTabs, mappingChecks: wb.parsed.mappingChecks, warnings: wb.parsed.warnings,
      counts: { sourceIds: wb.parsed.source.length, translations: wb.parsed.translations.length, changeReferenceRows: wb.parsed.changeRef.length, campaignTabs: wb.parsed.campaigns.length, updatesRows: wb.parsed.updatesRows.length },
    } : null,
    workbookError: wbError,
    attempts: studio.repo.attempts({ limit: 30 }).map((a) => ({ ...a, plan: { cells: a.plan?.cells?.map((c: any) => ({ ref: c.ref, after: c.after, purpose: c.purpose })) ?? [] } })),
    formats: FORMAT_SPECS,
  };
}

export type LibraryView = Awaited<ReturnType<typeof libraryView>>;
export type ItemView = LibraryView['items'][number];
export type { CopyItem };
