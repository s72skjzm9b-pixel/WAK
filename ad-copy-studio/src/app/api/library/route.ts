import { route, getStudio } from '@/server/http/handler';
import { libraryView } from '@/server/domain/views';
export const dynamic = 'force-dynamic';
export const GET = route(async () => libraryView(getStudio()));
