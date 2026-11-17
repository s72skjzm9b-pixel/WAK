import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
// Edit a collection brief. Only labels and editorial settings change — keys, IDs and mappings never do.
export const PATCH = route(async (req, ctx) => {
  const { key } = await ctx.params;
  const b = await body(req);
  const patch: any = { key };
  if (b.name !== undefined) { if (!String(b.name).trim()) throw new StudioError(400, 'A collection needs a name.'); patch.name = String(b.name).trim().slice(0, 60); }
  for (const k of ['description', 'imageNote']) if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 400);
  if (b.formats !== undefined) patch.formats = (b.formats as string[]).filter((f) => ['search', 'pmax', 'demand_gen'].includes(f));
  if (b.languages !== undefined) patch.languages = (b.languages as string[]).slice(0, 12);
  if (b.details !== undefined) {
    const d = b.details ?? {};
    if (d.path1 && String(d.path1).length > 15) throw new StudioError(400, 'Display path 1 can have at most 15 characters.');
    if (d.path2 && String(d.path2).length > 15) throw new StudioError(400, 'Display path 2 can have at most 15 characters.');
    patch.details = { finalUrl: d.finalUrl ?? '', path1: d.path1 ?? '', path2: d.path2 ?? '', cta: d.cta ?? '' };
  }
  (await (await getStudio()).repo.saveCollectionMeta(patch, actorFrom(req).name));
  return { ok: true };
}, { mutating: true });
