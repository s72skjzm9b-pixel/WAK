import { route, getStudio, body, actorFrom } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ({ feedback: await getStudio().feedback() }));
export const POST = route(async (req) => getStudio().addFeedback(await body(req), actorFrom(req)), { mutating: true });
