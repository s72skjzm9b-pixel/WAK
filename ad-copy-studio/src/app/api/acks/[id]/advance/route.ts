import { route, getStudio, actorFrom } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const POST = route(async (req, ctx) => getStudio().advanceReference((await ctx.params).id, actorFrom(req)), { mutating: true });
