import { route } from '@/server/http/handler';
import { signOut } from '@/server/google/auth';
export const dynamic = 'force-dynamic';
export const POST = route(async () => { signOut(); return { ok: true }; }, { mutating: true });
