import { route, getStudio, body, actorFrom } from '@/server/http/handler';
import { useIdea } from '@/server/domain/suggestions';
export const dynamic = 'force-dynamic';
export const POST = route(async (req) => useIdea(getStudio(), await body(req), actorFrom(req)), { mutating: true });
