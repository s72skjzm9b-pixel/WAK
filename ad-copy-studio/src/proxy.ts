// Hosted version: every page and API call requires a signed-in, allowed Google account.
// The local Mac version (no DATABASE_URL) passes straight through.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail } from './server/auth/access';

const PUBLIC = ['/login', '/auth/callback', '/auth/signout', '/api/health'];
const list = (v: string | undefined) => (v || '').split(',').map((x) => x.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

export async function proxy(request: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const { data } = await supabase.auth.getUser(); // refreshes the session cookie when needed
  const path = request.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p + '/'))) return response;
  const email = data.user?.email;
  const allowed = isAllowedEmail(email, list(process.env.STUDIO_ALLOWED_EMAIL_DOMAINS), list(process.env.STUDIO_ALLOWED_EMAILS));
  if (allowed) return response;
  if (path.startsWith('/api/')) return NextResponse.json({ error: email ? 'This Google account does not have access.' : 'Please sign in.' }, { status: 401 });
  const url = new URL('/login', request.url);
  if (email) url.searchParams.set('denied', '1');
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico|woff2?)$).*)'],
};
