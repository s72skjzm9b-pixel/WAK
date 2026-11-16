import { route, getStudio, body } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const POST = route(async (req, ctx) => {
  const b = await body(req).catch(() => ({}));
  getStudio().repo.resolveFeedback((await ctx.params).id, String(b.resolution ?? 'Resolved'));
  return { ok: true };
}, { mutating: true });
