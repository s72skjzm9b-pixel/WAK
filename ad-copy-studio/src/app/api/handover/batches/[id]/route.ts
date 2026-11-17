import { route, getStudio } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
export const GET = route(async (_req, ctx) => {
  const b = (await (await getStudio()).repo.getBatch((await ctx.params).id));
  if (!b) throw new StudioError(404, 'Batch not found');
  return new Response(b.csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${b.label}.csv"` } });
});
