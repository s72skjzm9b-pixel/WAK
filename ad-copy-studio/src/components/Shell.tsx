'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ROLES, useStudio, api, fmtTime, type Role } from './client';

const NAV = [
  { href: '/write', label: 'Write' },
  { href: '/review', label: 'Review' },
  { href: '/handover', label: 'Handover' },
  { href: '/connection', label: 'Connection' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { role, setRole, name, setName, status, reloadStatus, toast, bump } = useStudio();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api('/api/refresh', { body: {} });
      toast(r.ok ? 'Workbook refreshed.' : `Refresh failed: ${r.error?.message}`);
      await reloadStatus(); bump();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const mode = status?.mode as string | undefined;
  const last = status?.lastRead;
  const modeLabel = mode === 'google' ? 'Live Google Sheet' : mode === 'sandbox' ? 'Sandbox — practice copy, not the real Sheet' : mode === 'snapshot' ? 'Snapshot of the real workbook (read-only)' : 'Connecting…';
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">La Cabra <span>Ad Copy Studio</span></Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={path?.startsWith(n.href) ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="spacer" />
        <div className="rolebox">
          <label htmlFor="role">Viewing as</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          <input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <span className="muted" title="Role switching only changes the screens and the name recorded in history. It is not authentication or access control.">(demo roles — not sign-in)</span>
        </div>
      </header>
      <div className={`connbar ${mode ?? ''}`} role="status" aria-live="polite">
        <strong>{modeLabel}</strong>
        {mode === 'google' && <span>· {status?.canWrite ? 'Read & write' : 'Read-only'} · {status?.auth?.account ?? ''}</span>}
        {last && <span>· Last refresh {fmtTime(last.at)} {last.ok ? '' : <b style={{ color: 'var(--bad)' }}>failed: {last.errorMessage}</b>}</span>}
        {status?.workbook?.readAt && mode === 'snapshot' && <span>· Captured {fmtTime(status.workbook.readAt)}</span>}
        {status?.auth?.state && status.auth.state !== 'ready' && mode === 'google' && <span style={{ color: 'var(--bad)' }}>· {status.auth.detail}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh from Sheet'}</button>
        <Link className="btn small" href="/connection">Connection & sync</Link>
      </div>
      <main>{children}</main>
    </>
  );
}
