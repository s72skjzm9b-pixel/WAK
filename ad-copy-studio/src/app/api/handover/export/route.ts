import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { buildHandover, handoverCsv } from '@/server/domain/handover';
import { newId } from '@/server/store/repo';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => {
  const b = await body(req);
  const s = (await getStudio());
  const filters = { market: b.market || undefined, language: b.language || undefined, campaign: b.campaign || undefined };
  const h = await buildHandover(s, filters);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  const id = newId('batch');
  const { csv, rows, items } = handoverCsv(h, id);
  const label = `la-cabra-review-handover-${stamp}${filters.market ? '-' + filters.market : ''}${filters.language ? '-' + filters.language : ''}${s.mode() !== 'google' ? '-' + s.mode().toUpperCase() : ''}`;
  (await s.repo.insertBatch({ id, createdBy: actorFrom(req).role, mode: s.mode(), filters, items: { items, readAt: h.readAt, origin: h.origin, excluded: h.excluded }, csv, rowCount: rows, label }));
  return { id, label, rows };
}, { mutating: true });
