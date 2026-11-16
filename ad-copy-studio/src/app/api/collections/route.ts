import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
// New studio-only collection. Never creates campaigns or mappings.
export const POST = route(async (req) => {
  const b = await body(req);
  const name = String(b.name ?? '').trim();
  if (!name) throw new StudioError(400, 'Give the collection a name.');
  const key = `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'collection'}-${Date.now().toString(36)}`;
  getStudio().repo.saveCollectionMeta({ key, name, description: b.description ?? '', imageNote: b.imageNote ?? '', formats: b.formats?.length ? b.formats : ['search'], languages: b.languages?.length ? b.languages : ['EN'], details: {}, isLocal: true }, actorFrom(req).name);
  return { key };
}, { mutating: true });
