import { route, getStudio } from '@/server/http/handler';
export const dynamic = 'force-dynamic';
export const POST = route(async () => (await getStudio()).refresh(), { mutating: true });
