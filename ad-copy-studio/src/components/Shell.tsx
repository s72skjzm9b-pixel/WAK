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
      toast(r.ok ? (mode === 'google' ? 'Copy refreshed from the Sheet.' : 'Reloaded.') : `Could not refresh: ${r.error?.message}. Your drafts are safe.`);
      await reloadStatus(); bump();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const mode = status?.mode as string | undefined;
  const last = status?.lastRead;
  const label = mode === 'google' ? (status?.auth?.state === 'ready' && last?.ok !== false ? 'Live Sheet' : 'Live Sheet — not connected')
    : mode === 'sandbox' ? 'Practice copy' : mode === 'snapshot' ? 'Snapshot · edits saved locally' : '…';
  const refreshLabel = mode === 'google' ? 'Refresh from Sheet' : mode === 'sandbox' ? 'Reload practice copy' : 'Reload snapshot';
  const tone = mode === 'google' && label === 'Live Sheet' ? 'ok' : mode === 'google' ? 'bad' : mode === 'sandbox' ? 'warn' : 'neutral';
  if (path === '/login') return <main>{children}</main>;
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">La Cabra <span>Ad Copy Studio</span></Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="spacer" />
        <Link href="/settings" className={`tag ${tone} modetag`}>{label}</Link>
        <button className="btn small refresh" onClick={refresh} disabled={busy}>{busy ? 'Reading…' : refreshLabel}</button>
        {status?.user && <form action="/auth/signout" method="post" className="who"><span title={status.user.email}>{status.user.name}</span><button className="linkbtn" type="submit">Sign out</button></form>}
      </header>
      {mode === 'google' && last && !last.ok && <div className="banner bad">Couldn’t reach the Sheet ({last.errorMessage}). You can keep editing — drafts are saved on this computer and Sheet updates wait. <Link href="/settings">Settings</Link></div>}
      <main>{children}</main>
    </>
  );
}
