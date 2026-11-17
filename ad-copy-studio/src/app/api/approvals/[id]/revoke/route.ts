import { route, getStudio, body, actorFrom } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const POST = route(async (req, ctx) => {
  const b = await body(req).catch(() => ({}));
  (await getStudio()).revokeApproval((await ctx.params).id, actorFrom(req), String(b.reason ?? 'Approval withdrawn'));
  return { ok: true };
}, { mutating: true });
