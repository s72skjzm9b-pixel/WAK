import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/server/auth/supabase';
import { isAllowedEmail } from '@/server/auth/access';
import { config } from '@/server/config';
export const dynamic = 'force-dynamic';
// Google → Supabase → here. Exchanges the one-time code for a session cookie, then checks the allowlist.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const back = new URL('/login', req.nextUrl.origin);
  if (!code) { back.searchParams.set('error', '1'); return NextResponse.redirect(back); }
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) { back.searchParams.set('error', '1'); return NextResponse.redirect(back); }
  if (!isAllowedEmail(data.user.email, config.allowedEmailDomains, config.allowedEmails)) {
    await supabase.auth.signOut();
    back.searchParams.set('denied', '1');
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(new URL('/', req.nextUrl.origin));
}
