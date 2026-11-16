'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, useStudio, Tag, fmtTime } from '@/components/client';
import { PLACEMENTS } from '@/lib/typography';

export function ConnectionView() {
  const { status: s, reloadStatus, toast, bump } = useStudio();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const a = params.get('auth');
    if (a === 'ok') toast('Connected to Google. Workbook refreshed.');
    if (a === 'failed') toast(`Google sign-in failed: ${params.get('detail') ?? ''}`);
    if (a === 'denied') toast('Google sign-in was cancelled.');
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMode = async (mode: string) => {
    setBusy(true);
    try { const r = await api('/api/mode', { body: { mode } }); toast(r.ok ? `Switched to ${mode}.` : `Switched to ${mode}, but reading failed: ${r.error?.message}`); await reloadStatus(); bump(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  if (!s) return <p className="muted">Loading…</p>;
  if (s.error) return <div className="notice bad">{s.error}</div>;
  const wb = s.workbook;
  return (
    <div className="stack">
      <h1>Connection & sync</h1>
      <div className="panel">
        <h2>Where the studio reads the Sheet from</h2>
        <div className="grid3" style={{ marginTop: 10 }}>
          {[
            { m: 'google', t: 'Live Google Sheet', d: 'Reads the real workbook through the Sheets API with your server-side authorization. Writes only on “Approve and update Sheet” or “Advance saved reference”.' },
            { m: 'snapshot', t: 'Snapshot (read-only)', d: 'Real wording captured from the live workbook on 16 Nov 2026. Useful before Google is connected. Cannot write.' },
            { m: 'sandbox', t: 'Sandbox (practice)', d: 'A local writable copy of the snapshot that recalculates the workbook’s comparison formulas. Nothing reaches Google. Clearly labelled everywhere.' },
          ].map((o) => (
            <div key={o.m} className="panel" style={{ borderColor: s.mode === o.m ? 'var(--accent)' : undefined }}>
              <h3>{o.t} {s.mode === o.m && <Tag tone="accent">Current</Tag>}</h3>
              <p className="small">{o.d}</p>
              <button className="btn small" disabled={busy || s.mode === o.m} onClick={() => setMode(o.m)}>Use {o.t.toLowerCase()}</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Google authorization</h2>
        <dl className="facts">
          <dt>Method</dt><dd>{s.googleAuthMode === 'oauth' ? 'OAuth — sign in with a Google account that can edit the workbook' : 'Service account — the workbook is shared with its email'}</dd>
          <dt>Access requested</dt><dd>{s.googleAccess === 'readonly' ? 'spreadsheets.readonly (read only)' : 'spreadsheets (read and write — needed to update wording)'}</dd>
          <dt>Status</dt><dd>{s.auth.state === 'ready' ? <Tag tone="ok">Ready{s.auth.account ? ` · ${s.auth.account}` : ''}</Tag> : s.auth.state === 'needs_sign_in' ? <Tag tone="warn">Sign-in needed</Tag> : <Tag tone="bad">Not configured</Tag>} <span className="small">{s.auth.detail}</span></dd>
          <dt>Workbook ID</dt><dd className="mono">{s.spreadsheetId}</dd>
        </dl>
        <div className="row" style={{ marginTop: 12 }}>
          {s.googleAuthMode === 'oauth' && s.auth.state !== 'not_configured' && <a className="btn primary" href="/api/google/connect">{s.auth.state === 'ready' ? 'Sign in again' : 'Sign in with Google'}</a>}
          {s.googleAuthMode === 'oauth' && s.auth.state === 'ready' && <button className="btn" onClick={async () => { await api('/api/google/signout', { body: {} }); toast('Signed out. Token deleted from this computer.'); reloadStatus(); }}>Sign out</button>}
        </div>
        {s.auth.state === 'not_configured' && <p className="small" style={{ marginTop: 10 }}>See README → “Google connection setup”. Credentials stay on this computer in <code>.env.local</code> and <code>{s.dataDir}/secrets</code>; they are never sent to the browser or committed.</p>}
        {s.mode === 'google' && s.lastRead && !s.lastRead.ok && <div className="notice bad" style={{ marginTop: 10 }}>Last read failed ({s.lastRead.errorKind}): {s.lastRead.errorMessage}</div>}
      </div>

      {wb && (
        <div className="panel">
          <h2>Workbook discovery</h2>
          <p className="small">“{wb.title}” · read {fmtTime(wb.readAt)} · {wb.counts.sourceIds} source IDs · {wb.counts.translations} translation rows · {wb.counts.changeReferenceRows} change-reference rows · {wb.counts.campaignTabs} campaign tabs · {wb.counts.updatesRows} rows in Updates for Anabelle</p>
          {wb.limitations.length > 0 && <div className="notice" style={{ marginBottom: 10 }}><b>Snapshot notes:</b><ul>{wb.limitations.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul></div>}
          {wb.missingTabs.length > 0 && <div className="notice bad">Missing tabs: {wb.missingTabs.join(', ')}</div>}
          <details><summary>Tabs found ({wb.tabsFound.length}) — located by name, not position</summary><p className="small">{wb.tabsFound.join(' · ')}</p></details>
          <h3 style={{ marginTop: 12 }}>Column mapping (located by header text, checked against the documented layout)</h3>
          <table className="t"><thead><tr><th>Tab</th><th>Field</th><th>Expected</th><th>Found</th><th>Header</th></tr></thead><tbody>
            {wb.mappingChecks.map((c: any, i: number) => <tr key={i}><td>{c.tab}</td><td>{c.field}</td><td>{c.expected}</td><td>{c.found ?? '—'}</td><td className="small">{c.ok ? <Tag tone="ok">{c.header}</Tag> : <Tag tone="bad">{c.header ?? 'not found'}</Tag>}</td></tr>)}
          </tbody></table>
          {wb.warnings.length > 0 && <><h3 style={{ marginTop: 12 }}>Integrity warnings</h3><ul className="small">{wb.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></>}
        </div>
      )}

      <div className="panel">
        <h2>Sheet write log</h2>
        {s.attempts.length === 0 ? <p className="small muted">No writes yet.</p> : (
          <table className="t"><thead><tr><th>When</th><th>Mode</th><th>Purpose</th><th>Result</th><th>Cells</th><th>Detail</th></tr></thead><tbody>
            {s.attempts.map((a: any) => <tr key={a.id}><td className="small">{fmtTime(a.startedAt)}</td><td>{a.mode}</td><td>{a.purpose.replace('_', ' ')}</td><td><Tag tone={a.status === 'succeeded' || a.status === 'already_applied' ? 'ok' : a.status === 'started' ? 'neutral' : 'bad'}>{a.status.replace('_', ' ')}</Tag></td><td className="mono small">{a.plan.cells.map((c: any) => c.ref).join(', ')}</td><td className="small">{a.errorMessage ?? ''}</td></tr>)}
          </tbody></table>
        )}
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>Local data</h2>
          <p className="small">Database, sandbox copy, export history and tokens: <code>{s.dataDir}</code>. Back up with <code>npm run backup</code> (see README).</p>
        </div>
        <div className="panel">
          <h2>Preview typography & limits</h2>
          <ul className="small">{Object.values(PLACEMENTS).map((p) => <li key={p.key}><b>{p.label}:</b> {p.basis}</li>)}</ul>
          <ul className="small">{Object.values(s.formats).map((f: any) => <li key={f.format}><b>{f.label}:</b> {Object.entries(f.fields).map(([k, v]: any) => `${k} ${v.max}${v.verified ? '' : ' (unverified)'}`).join(', ')}. {f.counts}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
