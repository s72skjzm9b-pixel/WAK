import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => {
  const b = await body(req);
  const s = getStudio();
  const wb = await s.workbook();
  const c = wb.parsed.campaigns.find((x) => x.name === b.campaign);
  if (!c) throw new StudioError(404, 'Campaign not found');
  if (c.format !== 'search') throw new StudioError(400, 'Pinning applies to Search only. Performance Max assets must work in any combination within their group.');
  if (b.position && !['H1', 'H2', 'H3', 'D1', 'D2'].includes(b.position)) throw new StudioError(400, 'Unknown position');
  s.repo.setPin(b.campaign, b.group, b.sourceId, b.position || null, actorFrom(req).role);
  return { pins: s.repo.pins(b.campaign, b.group) };
}, { mutating: true });
