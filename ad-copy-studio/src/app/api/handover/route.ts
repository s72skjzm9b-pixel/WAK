import { route, getStudio } from '@/server/http/handler';
import { buildHandover, handoverText } from '@/server/domain/handover';
export const dynamic = 'force-dynamic';
export const GET = route(async (req) => {
  const u = req.nextUrl.searchParams;
  const h = await buildHandover(getStudio(), { market: u.get('market') || undefined, language: (u.get('language') || undefined) as any, campaign: u.get('campaign') || undefined });
  return { ...h, text: handoverText(h), batches: getStudio().repo.listBatches() };
});
