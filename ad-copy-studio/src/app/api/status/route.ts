import { route, getStudio } from '@/server/http/handler';
import { statusView } from '@/server/domain/views';
export const dynamic = 'force-dynamic';
export const GET = route(async () => statusView(getStudio()));
