import { route, getStudio, body, actorFrom } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ({ acks: getStudio().repo.listAcks() }));
export const POST = route(async (req) => getStudio().acknowledge(await body(req), actorFrom(req)), { mutating: true });
