import { route, getStudio, body, actorFrom } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => {
  const b = await body(req);
  return (await getStudio()).approveAsIs(b.sourceId, b.language, actorFrom(req), b.note ?? '');
}, { mutating: true });
