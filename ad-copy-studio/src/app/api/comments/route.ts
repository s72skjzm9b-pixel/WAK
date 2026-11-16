import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { addComment } from '@/server/domain/feedback';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => addComment(getStudio(), await body(req), actorFrom(req)), { mutating: true });
