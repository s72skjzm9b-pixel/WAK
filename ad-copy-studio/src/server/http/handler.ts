import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { StudioError, type Actor } from '../domain/studio';
import { SheetError } from '../sheets/gateway';
import { getStudio } from '../instance';
import { config } from '../config';

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
function hostAllowed(host: string): boolean {
  if (LOCAL_HOSTS.test(host)) return true;
  const name = host.toLowerCase().replace(/:\d+$/, '');
  return config.allowedHosts.includes('*') || config.allowedHosts.includes(name);
}

const verified = new WeakMap<NextRequest, Actor>();

/** Who did this. Online: the verified Google account (set by route()). Locally: the optional name from Settings. */
export function actorFrom(req: NextRequest): Actor {
  const v = verified.get(req);
  if (v) return v;
  const name = decodeURIComponent(req.headers.get('x-studio-name') || '').slice(0, 60);
  return { role: 'Local user', name: name || 'Local user' };
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<unknown>;

export function route(fn: Handler, opts: { mutating?: boolean } = {}) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    if (config.hosted) {
      // Online: a verified, allowed Google account is required for every API call (the proxy checks too).
      const { currentUser } = await import('../auth/supabase');
      const user = await currentUser();
      if (!user) return NextResponse.json({ error: 'Please sign in with an allowed La Cabra Google account.' }, { status: 401 });
      verified.set(req, { role: 'Signed in', name: user.name, email: user.email } as Actor);
    } else if (!hostAllowed(host)) {
      // Local: only answer requests addressed to this machine.
      return NextResponse.json({ error: 'This local app only answers on localhost.' }, { status: 403 });
    }
    if (opts.mutating) {
      // Writes must come from the studio's own pages: same origin and the app's custom header.
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== host && (config.hosted || !hostAllowed(new URL(origin).host))) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
      if (!req.headers.get('x-studio-client')) return NextResponse.json({ error: 'Missing app header.' }, { status: 400 });
    }
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof StudioError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof SheetError) return NextResponse.json({ error: e.message, kind: e.kind }, { status: 502 });
      console.error('[studio] unexpected error:', e instanceof Error ? e.message : 'unknown');
      return NextResponse.json({ error: 'Unexpected server error. Your work is unchanged.' }, { status: 500 });
    }
  };
}

export async function body<T = any>(req: NextRequest): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new StudioError(400, 'Invalid JSON body'); }
}

export { getStudio };
