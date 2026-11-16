import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
export const dynamic = 'force-dynamic';
export const POST = route(async (req, ctx) => {
  const { id, action } = await ctx.params;
  const s = getStudio();
  const actor = actorFrom(req);
  const b = await body(req).catch(() => ({}));
  switch (action) {
    case 'submit': return s.submit(id, actor);
    case 'request-changes': return s.requestChanges(id, String(b.comment ?? ''), actor);
    case 'withdraw': return s.withdraw(id, actor);
    case 'approve':
      if (!/approver|reviewer/i.test(actor.role)) throw new StudioError(403, 'Switch to the Approver role to approve. (Role switching is a local convenience, not access control.)');
      return s.approve(id, actor, { updateSheet: !!b.updateSheet, note: b.note });
    case 'write':
      if (!/approver|reviewer/i.test(actor.role)) throw new StudioError(403, 'Switch to the Approver role to update the Sheet.');
      return s.writeToSheet(id, actor);
    default: throw new StudioError(404, 'Unknown action');
  }
}, { mutating: true });
