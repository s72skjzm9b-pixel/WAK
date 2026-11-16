import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { StudioError } from '@/server/domain/studio';
import { accept, returnForEditing, keepAgainstCurrent } from '@/server/domain/suggestions';
export const dynamic = 'force-dynamic';
export const POST = route(async (req, ctx) => {
  const { id, action } = await ctx.params;
  const s = getStudio();
  const actor = actorFrom(req);
  const b = await body(req).catch(() => ({}));
  switch (action) {
    case 'accept': return accept(s, id, actor);
    case 'return': return returnForEditing(s, id, String(b.comment ?? ''), actor);
    case 'keep-current': return keepAgainstCurrent(s, id, actor);
    case 'revert':
    case 'withdraw': return s.withdraw(id, actor);
    case 'write': return s.writeToSheet(id, actor);
    case 'mark-applied': {
      // Anabelle says she applied it in Google Ads: record that, then move the Sheet's saved reference
      // so the row leaves “Updates for Anabelle”. This records her word; it does not check Google Ads.
      const rev = s.mustRevision(id);
      const ack = await s.acknowledge({ revisionId: id, sourceId: rev.sourceId, language: rev.language, appliedText: rev.proposedText }, actor);
      return s.advanceReference(ack.id, actor);
    }
    // Earlier workflow actions kept for compatibility.
    case 'submit': return s.submit(id, actor);
    case 'request-changes': return s.requestChanges(id, String(b.comment ?? ''), actor);
    case 'approve': return s.approve(id, actor, { updateSheet: !!b.updateSheet, note: b.note });
    default: throw new StudioError(404, 'Unknown action');
  }
}, { mutating: true });
