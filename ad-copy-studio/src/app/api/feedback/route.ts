import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { setVerdict } from '@/server/domain/feedback';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ({ feedback: getStudio().repo.listFeedback(), comments: getStudio().repo.comments() }));
// { combo, verdict: 'works' | 'needs_changes' | null, scope? } — same verdict again clears it.
export const POST = route(async (req) => setVerdict(getStudio(), await body(req), actorFrom(req)), { mutating: true });
