import { NextResponse } from 'next/server';
import { route, getStudio } from '@/server/http/handler';
import { completeOAuth } from '@/server/google/auth';
import { describeError } from '@/server/sheets/gateway';
export const dynamic = 'force-dynamic';
export const GET = route(async (req) => {
  const u = req.nextUrl.searchParams;
  const back = new URL('/connection', req.nextUrl.origin);
  if (u.get('error')) { back.searchParams.set('auth', 'denied'); return NextResponse.redirect(back); }
  try {
    await completeOAuth(u.get('code') ?? '', u.get('state') ?? '');
    const s = (await getStudio());
    s.setMode('google');
    await s.refresh();
    back.searchParams.set('auth', 'ok');
  } catch (e) {
    back.searchParams.set('auth', 'failed');
    back.searchParams.set('detail', describeError(e).message.slice(0, 200));
  }
  return NextResponse.redirect(back);
});
