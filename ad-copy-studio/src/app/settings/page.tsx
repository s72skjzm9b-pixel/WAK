'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, useStudio, fmtTime } from '@/components/client';
import { PLACEMENTS } from '@/lib/typography';

export default function Page() { return <Suspense><Settings /></Suspense>; }

function Settings() {
  const { status: s, reloadStatus, toast, bump, name, setName } = useStudio();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const a = params.get('auth');
    if (a === 'ok') toast('Connected to the Google Sheet.');
    if (a === 'failed') toast(`Google sign-in failed: ${params.get('detail') ?? ''}`);
    if (a === 'denied') toast('Google sign-in was cancelled.');
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMode = async (mode: string) => {
    setBusy(true);
    try { const r = await api('/api/mode', { body: { mode } }); toast(r.ok ? 'Switched.' : `Switched, but the Sheet could not be read: ${r.error?.message}`); await reloadStatus(); bump(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  if (!s) return <p className="muted">Loading…</p>;
  if (s.error) return <div className="notice bad">{s.error}</div>;
  const wb = s.workbook;
  const modes = [
    { m: 'google', t: 'Live Sheet', d: 'Reads the real workbook. Accepting a change writes it to the Sheet and checks it was saved.' },
    { m: 'snapshot', t: 'Snapshot', d: `Read-only copy of the Sheet${wb?.origin === 'snapshot' ? ` captured ${fmtTime(wb.readAt)}` : ''}. Editing works; Sheet updates wait.` },
    { m: 'sandbox', t: 'Practice copy', d: 'A local copy you can safely accept changes into. Never reaches Google.' },
  ];
  return (
    <div className="settings">
      <h1>Settings</h1>
      <section>
        <h2>Where copy comes from</h2>
        <div className="modes">
          {modes.map((o) => (
            <button key={o.m} className="mode" aria-pressed={s.mode === o.m} disabled={busy} onClick={() => s.mode !== o.m && setMode(o.m)}>
              <b>{o.t}{s.mode === o.m ? ' — in use' : ''}</b><span>{o.d}</span>
            </button>
          ))}
        </div>
        <p className="small muted">
          {s.lastRead ? <>Last read {fmtTime(s.lastRead.at)} {s.lastRead.ok ? '· OK' : <b style={{ color: 'var(--bad)' }}>· failed: {s.lastRead.errorMessage}</b>}</> : 'Not read yet.'}
        </p>
      </section>

      <section>
        <h2>Google connection</h2>
        <p>
          {s.auth.state === 'ready' ? <>Connected{s.auth.account ? ` as ${s.auth.account}` : ''}.</> : s.auth.state === 'needs_sign_in' ? 'Not signed in.' : 'Not set up yet — see “Google connection setup” in the README.'}
          {s.googleAccess === 'readonly' && ' Read-only access.'}
        </p>
        <div className="row">
          {s.googleAuthMode === 'oauth' && s.auth.state !== 'not_configured' && <a className="btn small primary" href="/api/google/connect">{s.auth.state === 'ready' ? 'Sign in again' : 'Sign in with Google'}</a>}
          {s.googleAuthMode === 'oauth' && s.auth.state === 'ready' && <button className="btn small" onClick={async () => { await api('/api/google/signout', { body: {} }); toast('Signed out.'); reloadStatus(); }}>Sign out</button>}
        </div>
      </section>

      <section>
        <h2>Your name</h2>
        <p className="small muted">Recorded in the history of suggestions and feedback. This is not a sign-in: anyone using this computer can edit. Real accounts and permissions are needed before sharing the app.</p>
        <input type="text" value={name} placeholder="e.g. Christian" onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
      </section>

      <details className="tech">
        <summary>Technical details</summary>
        <p className="small">Workbook ID <code>{s.spreadsheetId}</code> · local data in <code>{s.dataDir}</code> (back up with <code>npm run backup</code>).</p>
        {wb && <>
          <p className="small">{wb.counts.sourceIds} source IDs · {wb.counts.campaignTabs} campaign tabs · {wb.counts.updatesRows} rows in “Updates for Anabelle”.</p>
          {wb.limitations?.length > 0 && <ul className="small">{wb.limitations.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul>}
          <table className="t small"><thead><tr><th>Tab</th><th>Field</th><th>Column</th><th /></tr></thead><tbody>
            {wb.mappingChecks.map((c: any, i: number) => <tr key={i}><td>{c.tab}</td><td>{c.field}</td><td>{c.found ?? '—'}</td><td>{c.ok ? 'OK' : `expected ${c.expected}`}</td></tr>)}
          </tbody></table>
          {wb.warnings.length > 0 && <ul className="small">{wb.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
        </>}
        <h4>Sheet writes</h4>
        {s.attempts.length === 0 ? <p className="small muted">None yet.</p> : <table className="t small"><tbody>{s.attempts.map((a: any) => <tr key={a.id}><td>{fmtTime(a.startedAt)}</td><td>{a.mode}</td><td>{a.status.replace('_', ' ')}</td><td><code>{a.plan.cells.map((c: any) => c.ref).join(', ')}</code></td><td>{a.errorMessage ?? ''}</td></tr>)}</tbody></table>}
        <h4>Preview typography (approximate)</h4>
        <ul className="small">{Object.values(PLACEMENTS).map((p) => <li key={p.key}><b>{p.label}:</b> {p.basis}</li>)}</ul>
      </details>
    </div>
  );
}
