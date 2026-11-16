'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStudio, api, fmtTime } from './client';

const NAV = [
  { href: '/', label: 'Workspace' },
  { href: '/changes', label: 'Changes' },
  { href: '/settings', label: 'Settings' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const { status, reloadStatus, toast, bump } = useStudio();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api('/api/refresh', { body: {} });
      toast(r.ok ? 'Copy refreshed from the Sheet.' : `Could not refresh: ${r.error?.message}. Your suggestions are safe.`);
      await reloadStatus(); bump();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const mode = status?.mode as string | undefined;
  const last = status?.lastRead;
  const label = mode === 'google' ? (status?.auth?.state === 'ready' && last?.ok !== false ? 'Live Sheet' : 'Live Sheet — not connected')
    : mode === 'sandbox' ? 'Practice copy (not the real Sheet)' : mode === 'snapshot' ? 'Snapshot of the Sheet · read-only' : '…';
  const tone = mode === 'google' && label === 'Live Sheet' ? 'ok' : mode === 'google' ? 'bad' : mode === 'sandbox' ? 'warn' : 'neutral';
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">La Cabra <span>Ad Copy Studio</span></Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="spacer" />
        <span className={`tag ${tone}`} title={last ? `Last read ${fmtTime(last.at)}${last.ok ? '' : ` — failed: ${last.errorMessage}`}` : ''}>{label}</span>
        <button className="btn small" onClick={refresh} disabled={busy} title="Read the latest copy from the Sheet">{busy ? 'Refreshing…' : 'Refresh'}</button>
      </header>
      {mode === 'google' && last && !last.ok && <div className="banner bad">Couldn’t reach the Sheet ({last.errorMessage}). You can keep editing — suggestions are saved on this computer and Sheet updates wait. <Link href="/settings">Settings</Link></div>}
      <main>{children}</main>
    </>
  );
}
