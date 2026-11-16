// The single read model for the workspace: collections, the copy in them, open suggestions and feedback.
import type { Studio } from './studio';
import { buildCollections, collectionForTargets } from './collections';
import { revisionSummary } from './summary';

export async function workspaceView(studio: Studio) {
  const wb = await studio.workbook();
  const collections = buildCollections(wb.parsed, wb.library);
  const inCollections = new Set(collections.flatMap((c) => c.sourceIds));
  const items = wb.library.filter((i) => inCollections.has(i.sourceId)).map((i) => ({
    sourceId: i.sourceId, theme: i.theme, assetType: i.assetType, linkedHeadline: i.linkedHeadline, intent: i.intent, scope: i.scope,
    usageRule: i.usageRule, shortened: i.shortened, note: i.note,
    versions: { EN: { text: i.versions.EN.text, status: i.versions.EN.sheetStatus }, DK: { text: i.versions.DK.text, status: i.versions.DK.sheetStatus }, DE: { text: i.versions.DE.text, status: i.versions.DE.sheetStatus } },
    usages: i.usages.map((u) => ({ campaign: u.campaign, group: u.group, format: u.format, language: u.language })),
  }));
  const all = studio.repo.listRevisions();
  const suggestions = all
    .filter((r) => !r.isTest && (['draft', 'submitted', 'changes_requested', 'approved'].includes(r.state) || (r.state === 'written' && Date.now() - Date.parse(r.updatedAt) < 30 * 864e5)))
    .map((r) => {
      const s = revisionSummary(r);
      const collection = r.kind === 'variation' ? (r.meta.collection ?? collectionForTargets(collections, r.meta.targets) ?? 'not-yet-assigned') : null;
      const returned = r.state === 'changes_requested' ? studio.repo.events(r.id).reverse().find((e: any) => e.action === 'changes_requested')?.detail?.comment ?? '' : null;
      return { ...s, collection, returnedNote: returned };
    });
  const mode = studio.mode();
  return {
    readAt: wb.readAt, origin: wb.origin, mode, canWrite: studio.gateway().canWrite,
    connection: { mode, label: mode === 'google' ? 'Live Sheet' : mode === 'sandbox' ? 'Practice copy' : 'Snapshot (read-only)' },
    collections, items, suggestions,
    feedback: studio.repo.listFeedback(),
    acks: studio.repo.listAcks().map((a) => ({ id: a.id, revisionId: a.revisionId, referenceState: a.referenceState, referenceDetail: a.referenceDetail, at: a.acknowledgedAt })),
  };
}
export type WorkspaceView = Awaited<ReturnType<typeof workspaceView>>;
