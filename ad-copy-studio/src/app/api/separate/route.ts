import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { separateVersion } from '@/server/domain/suggestions';
import { revisionSummary } from '@/server/domain/summary';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => {
  const b = await body(req);
  return revisionSummary(await separateVersion((await getStudio()), { sourceId: b.sourceId, collection: b.collection, text: b.text }, actorFrom(req)));
}, { mutating: true });
