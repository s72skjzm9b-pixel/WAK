import { route, getStudio, body, actorFrom } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ({ acks: (await (await getStudio()).repo.listAcks()) }));
export const POST = route(async (req) => (await getStudio()).acknowledge(await body(req), actorFrom(req)), { mutating: true });
