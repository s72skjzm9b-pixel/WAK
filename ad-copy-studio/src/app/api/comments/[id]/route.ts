import { route, getStudio, body } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
export const PATCH = route(async (req, ctx) => {
  const { id } = await ctx.params;
  const b = await body(req);
  const repo = getStudio().repo;
  if (b.text !== undefined) { if (!String(b.text).trim()) throw new StudioError(400, 'A comment cannot be empty — delete it instead.'); repo.editComment(id, String(b.text).trim()); }
  if (b.resolved !== undefined) repo.resolveComment(id, !!b.resolved);
  return { ok: true };
}, { mutating: true });
export const DELETE = route(async (_req, ctx) => { getStudio().repo.deleteComment((await ctx.params).id); return { ok: true }; }, { mutating: true });
