// The single read model for the workspace and Changes: collections (with briefs), the copy in them,
// suggestions across the whole lifecycle, intended vs mapped uses, feedback, comments and workbook status.
import type { Studio } from './studio';
import { CANONICAL_LANGS } from './studio';
import { buildCollections, collectionForTargets, withBriefs } from './collections';
import { revisionSummary } from './summary';
import { approveMeaning } from './suggestions';
import { config } from '../config';

export const BUILTIN_LANGS = [
  { code: 'EN', name: 'English', locale: 'en', canonical: true },
  { code: 'DK', name: 'Danish', locale: 'da', canonical: true },
  { code: 'DE', name: 'German', locale: 'de', canonical: true },
];

export async function workspaceView(studio: Studio) {
  const wb = await studio.workbook();
  const collections = withBriefs(buildCollections(wb.parsed, wb.library), studio.repo.collectionMeta());
  const colOfGroup = (campaign: string | null, group: string | null) => collections.find((c) => c.groups.some((g) => g.campaign === campaign && g.group === group))?.key ?? null;

  // Every Sheet line that any collection shows (ideas included) — plus lines used only via studio intent.
  const intended = studio.repo.intendedUses().map((u) => ({ ...u, collection: u.collection || colOfGroup(u.campaign, u.group) || '' }));
  const shown = new Set([...collections.flatMap((c) => c.sourceIds), ...intended.map((u) => u.sourceId)]);
  const items = wb.library.filter((i) => shown.has(i.sourceId) && !i.isTest).map((i) => ({
    sourceId: i.sourceId, theme: i.theme, assetType: i.assetType, linkedHeadline: i.linkedHeadline, linkedHeadlineId: i.linkedHeadlineId,
    intent: i.intent, scope: i.scope, usageRule: i.usageRule, shortened: i.shortened, note: i.note,
    versions: { EN: { text: i.versions.EN.text, status: i.versions.EN.sheetStatus }, DK: { text: i.versions.DK.text, status: i.versions.DK.sheetStatus }, DE: { text: i.versions.DE.text, status: i.versions.DE.sheetStatus } },
    usages: i.usages.map((u) => ({ campaign: u.campaign, group: u.group, format: u.format, language: u.language, market: u.market })),
    mappedCollections: collections.filter((c) => c.sourceIds.includes(i.sourceId)).map((c) => c.key),
  }));

  const reads = new Map<number, any>();
  const provenance = (readId: number | null) => {
    if (readId == null) return null;
    if (!reads.has(readId)) reads.set(readId, studio.repo.getRead(readId));
    const r = reads.get(readId);
    return r ? { mode: r.mode, at: r.finishedAt } : null;
  };
  const suggestions = studio.repo.listRevisions().filter((r) => !r.isTest && r.state !== 'superseded').map((r) => {
    const s = revisionSummary(r);
    const home = r.kind === 'variation' ? (r.meta.collection ?? collectionForTargets(collections, r.meta.targets) ?? null) : null;
    const returned = r.state === 'changes_requested' ? studio.repo.events(r.id).reverse().find((e: any) => e.action === 'changes_requested')?.detail?.comment ?? '' : null;
    return {
      ...s, collection: home, needsIntendedUse: r.kind === 'variation' && r.language === 'EN' && !home && !intended.some((u) => u.sourceId === r.sourceId),
      returnedNote: returned, readyAt: r.readyAt, appliedAt: r.appliedAt, appliedBy: r.appliedBy, provenance: provenance(r.baseReadId),
      canonicalLanguage: CANONICAL_LANGS.includes(r.language), approveLabel: approveMeaning(studio, r).label,
    };
  });

  // Workbook facts that must stay visible even though rows without source IDs are not editable lines.
  const pmaxGaps = wb.parsed.campaigns.filter((c) => c.format === 'pmax' && c.gaps.some((g) => /long headline/i.test(g.assetType))).map((c) => c.name);
  const flagged = wb.parsed.translations.filter((t) => /needs translation approval/i.test(t.dkStatus) || /needs translation approval/i.test(t.deStatus));
  const mode = studio.mode();
  const extra = studio.repo.languages().map((l) => ({ ...l, canonical: false }));
  return {
    readAt: wb.readAt, origin: wb.origin, mode, canWrite: studio.gateway().canWrite,
    connection: {
      mode, liveWritesEnabled: config.liveWritesEnabled,
      label: mode === 'google' ? 'Live Sheet' : mode === 'sandbox' ? 'Practice copy' : 'Snapshot · edits saved locally',
      approveLabel: approveMeaning(studio).label, approveNote: approveMeaning(studio).note,
    },
    businessName: studio.repo.getSetting('business_name') ?? 'La Cabra',
    languages: [...BUILTIN_LANGS, ...extra],
    collections, items, suggestions, intendedUses: intended,
    feedback: studio.repo.listFeedback(),
    comments: studio.repo.comments(),
    workbookStatus: {
      pmaxTabsMissingLongHeadline: pmaxGaps,
      translationApprovalFlags: flagged.length,
      translationFlagIds: flagged.map((t) => ({ sourceId: t.sourceId, DK: /needs translation approval/i.test(t.dkStatus), DE: /needs translation approval/i.test(t.deStatus) })),
    },
  };
}
export type WorkspaceView = Awaited<ReturnType<typeof workspaceView>>;
