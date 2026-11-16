import { route, getStudio, body } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => {
  const b = await body(req);
  if (b.businessName !== undefined) {
    const n = String(b.businessName).trim();
    if (!n || [...n].length > 25) throw new StudioError(400, 'The business name needs 1–25 characters.');
    getStudio().repo.setSetting('business_name', n);
  }
  return { ok: true };
}, { mutating: true });
