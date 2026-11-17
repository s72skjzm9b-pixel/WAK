import { route, getStudio } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const DELETE = route(async (_req, ctx) => { (await (await getStudio()).repo.removeIntendedUse((await ctx.params).id)); return { ok: true }; }, { mutating: true });
