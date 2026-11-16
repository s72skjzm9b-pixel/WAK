import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { revisionSummary } from '@/server/domain/views';
export const dynamic = 'force-dynamic';
export const GET = route(async (_req, ctx) => getStudio().approvalView((await ctx.params).id));
export const PATCH = route(async (req, ctx) => {
  const b = await body(req);
  return revisionSummary(await getStudio().editRevision((await ctx.params).id, b, actorFrom(req)));
}, { mutating: true });
