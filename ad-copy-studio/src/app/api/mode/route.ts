import { route, getStudio, body } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => {
  const { mode } = await body<{ mode: 'google' | 'snapshot' | 'sandbox' }>(req);
  const s = getStudio();
  s.setMode(mode);
  return s.refresh();
}, { mutating: true });
