import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
import { accept, returnForEditing, keepAgainstCurrent, markReady, backToDraft } from '@/server/domain/suggestions';
export const dynamic = 'force-dynamic';
export const POST = route(async (req, ctx) => {
  const { id, action } = await ctx.params;
  const s = getStudio();
  const actor = actorFrom(req);
  const b = await body(req).catch(() => ({}));
  switch (action) {
    case 'ready': return markReady(s, id, actor);
    case 'back-to-draft': return backToDraft(s, id, actor);
    case 'accept': return accept(s, id, actor);
    case 'return': return returnForEditing(s, id, String(b.comment ?? ''), actor);
    case 'keep-current': return keepAgainstCurrent(s, id, actor);
    case 'revert':
    case 'withdraw': return s.withdraw(id, actor);
    case 'write': return s.writeToSheet(id, actor);
    case 'applied':
    case 'mark-applied': return s.markApplied(id, actor);
    case 'submit': return markReady(s, id, actor);
    case 'request-changes': return s.requestChanges(id, String(b.comment ?? ''), actor);
    default: throw new StudioError(404, 'Unknown action');
  }
}, { mutating: true });
