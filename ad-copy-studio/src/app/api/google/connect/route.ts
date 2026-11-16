import { NextResponse } from 'next/server';
import { route } from '@/server/http/handler';
import { beginOAuth } from '@/server/google/auth';
export const dynamic = 'force-dynamic';
export const GET = route(async (req) => {
  const origin = `${req.nextUrl.protocol}//${req.headers.get('host')}`.replace('127.0.0.1', 'localhost');
  return NextResponse.redirect(await beginOAuth(`${origin}/api/google/callback`));
});
