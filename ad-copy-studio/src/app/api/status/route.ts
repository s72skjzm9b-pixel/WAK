import { route, getStudio, actorFrom } from '@/server/http/handler';
import { config } from '@/server/config';
import { statusView } from '@/server/domain/views';
export const dynamic = 'force-dynamic';
export const GET = route(async (req) => {
  const v = await statusView(await getStudio());
  const a = actorFrom(req);
  return { ...v, hosted: config.hosted, user: config.hosted ? { name: a.name, email: (a as any).email } : null };
});
