import { route, getStudio } from '@/server/http/handler';
import { workspaceView } from '@/server/domain/workspace';
import { authStatus } from '@/server/google/auth';
export const dynamic = 'force-dynamic';
export const GET = route(async () => {
  const v = await workspaceView(getStudio());
  return { ...v, connection: { ...v.connection, authState: authStatus().state } };
});
