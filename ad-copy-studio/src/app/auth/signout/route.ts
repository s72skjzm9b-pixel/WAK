import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/server/auth/supabase';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.nextUrl.origin), { status: 303 });
}
