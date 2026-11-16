import { route, getStudio } from '@/server/http/handler';
import { groupContext } from '@/server/domain/views';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
export const GET = route(async (req) => {
  const u = req.nextUrl.searchParams;
  const out = await groupContext(getStudio(), u.get('campaign') ?? '', u.get('group') ?? '', { overlay: u.get('overlay') === '1' });
  if (!out) throw new StudioError(404, 'Campaign not found');
  return out;
});
