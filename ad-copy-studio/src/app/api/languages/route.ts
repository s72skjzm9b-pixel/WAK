import { route, getStudio, body } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
// Extra languages are local only: the master Sheet has columns for English, Danish and German.
export const POST = route(async (req) => {
  const b = await body(req);
  const code = String(b.code ?? '').trim().toUpperCase().replace(/[^A-Z-]/g, '').slice(0, 8);
  const name = String(b.name ?? '').trim().slice(0, 40);
  if (!code || !name) throw new StudioError(400, 'Choose a language.');
  if (['EN', 'DK', 'DA', 'DE'].includes(code)) throw new StudioError(400, `${name} is already available.`);
  getStudio().repo.addLanguage(code, name, b.locale ?? null);
  return { code };
}, { mutating: true });
