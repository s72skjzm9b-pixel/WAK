import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
// Studio use = local editorial intent. It never changes the Sheet's mappings.
export const POST = route(async (req) => {
  const b = await body(req);
  if (!b.sourceId || !b.collection) throw new StudioError(400, 'Choose a line and a collection.');
  return (await (await getStudio()).repo.addIntendedUse({ sourceId: b.sourceId, collection: b.collection, field: b.field ?? null, format: b.format ?? null, campaign: null, group: null, createdBy: actorFrom(req).name }));
}, { mutating: true });
