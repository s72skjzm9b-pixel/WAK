import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { revisionSummary } from '@/server/domain/views';
export const dynamic = 'force-dynamic';
export const GET = route(async (req) => {
  const states = req.nextUrl.searchParams.get('states')?.split(',').filter(Boolean);
  return { revisions: getStudio().repo.listRevisions({ states }).map(revisionSummary) };
});
export const POST = route(async (req) => {
  const b = await body(req);
  return revisionSummary(await getStudio().createRevision(b, actorFrom(req)));
}, { mutating: true });
