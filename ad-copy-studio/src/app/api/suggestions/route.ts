import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { saveEdit, saveNewCopy } from '@/server/domain/suggestions';
import { revisionSummary } from '@/server/domain/summary';
export const dynamic = 'force-dynamic';
// Autosave. Edits are stored as local suggestions; the Sheet is never written here.
export const PUT = route(async (req) => {
  const b = await body(req);
  const s = getStudio();
  const res = b.isNew
    ? await saveNewCopy(s, { sourceId: b.sourceId || undefined, collection: b.collection, assetType: b.assetType, language: b.language, text: String(b.text ?? '') }, actorFrom(req))
    : await saveEdit(s, { sourceId: b.sourceId, language: b.language, text: String(b.text ?? '') }, actorFrom(req));
  return { status: res.status, revision: res.revision ? revisionSummary(res.revision) : null };
}, { mutating: true });
