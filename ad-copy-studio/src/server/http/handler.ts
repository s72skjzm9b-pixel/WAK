import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { StudioError, type Actor } from '../domain/studio';
import { SheetError } from '../sheets/gateway';
import { getStudio } from '../instance';

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Role switching is a local convenience, not authentication. The role is recorded for history only. */
export function actorFrom(req: NextRequest): Actor {
  const role = (req.headers.get('x-studio-role') || '').slice(0, 40);
  const name = decodeURIComponent(req.headers.get('x-studio-name') || '').slice(0, 60);
  return { role: role || 'Unknown role', name };
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<unknown>;

export function route(fn: Handler, opts: { mutating?: boolean } = {}) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    // Local prototype hardening: only answer requests addressed to this machine, and require the
    // app's custom header on writes so other websites cannot post to the local server.
    const host = req.headers.get('host') || '';
    if (!LOCAL_HOSTS.test(host)) return NextResponse.json({ error: 'This local app only answers on localhost.' }, { status: 403 });
    if (opts.mutating) {
      const origin = req.headers.get('origin');
      if (origin && !LOCAL_HOSTS.test(new URL(origin).host)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
      if (!req.headers.get('x-studio-role')) return NextResponse.json({ error: 'Missing role header.' }, { status: 400 });
    }
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof StudioError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof SheetError) return NextResponse.json({ error: e.message, kind: e.kind }, { status: 502 });
      console.error('[studio] unexpected error:', e instanceof Error ? e.message : 'unknown');
      return NextResponse.json({ error: 'Unexpected server error. Your local data is unchanged.' }, { status: 500 });
    }
  };
}

export async function body<T = any>(req: NextRequest): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new StudioError(400, 'Invalid JSON body'); }
}

export { getStudio };
