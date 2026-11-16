'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, useStudio, fmtTime, safeSet } from '@/components/client';
import { PLACEMENTS } from '@/lib/typography';

export default function Page() { return <Suspense><Settings /></Suspense>; }

function Settings() {
  const { status: s, reloadStatus, toast, bump, name, setName } = useStudio();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<any>(null);
  const [ws, setWs] = useState<any>(null);
  const [biz, setBiz] = useState('');
  const loadLive = useCallback(async () => { setLive(null); try { setLive(await api('/api/live-check')); } catch (e) { setLive({ error: (e as Error).message }); } }, []);
  useEffect(() => { loadLive(); api('/api/workspace').then((w) => { setWs(w); setBiz(w.businessName); }).catch(() => {}); }, [loadLive]);
  useEffect(() => {
    const a = params.get('auth');
    if (a === 'ok') toast('Signed in with Google.');
    if (a === 'failed') toast(`Google sign-in failed: ${params.get('detail') ?? ''}`);
    if (a === 'denied') toast('Google sign-in was cancelled.');
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMode = async (mode: string) => {
    setBusy(true);
    try { const r = await api('/api/mode', { body: { mode } }); toast(r.ok ? 'Switched.' : `Switched, but reading failed: ${r.error?.message}`); await reloadStatus(); bump(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  if (!s) return <p className="muted">Loading…</p>;
  if (s.error) return <div className="notice bad">{s.error}</div>;
  const wb = s.workbook;
  const canLive = !!live?.canUseLive;
  return (
    <div className="settings">
      <h1>Settings</h1>
      <section>
        <h2>Where copy comes from</h2>
        <div className="modes">
          <button className="mode" aria-pressed={s.mode === 'snapshot'} disabled={busy} onClick={() => s.mode !== 'snapshot' && setMode('snapshot')}>
            <b>Snapshot{s.mode === 'snapshot' ? ' — in use' : ''}</b><span>A read-only copy of the Sheet{wb?.origin === 'snapshot' ? ` captured ${fmtTime(wb.readAt)}` : ''}. You can edit freely — drafts and approvals are saved on this computer.</span>
          </button>
          <button className="mode" aria-pressed={s.mode === 'sandbox'} disabled={busy} onClick={() => s.mode !== 'sandbox' && setMode('sandbox')}>
            <b>Practice copy{s.mode === 'sandbox' ? ' — in use' : ''}</b><span>A local copy of the Sheet you can safely accept changes into. Never reaches Google.</span>
          </button>
          <button className="mode" aria-pressed={s.mode === 'google'} disabled={busy || (!canLive && s.mode !== 'google')} onClick={() => s.mode !== 'google' && setMode('google')}>
            <b>Live Sheet{s.mode === 'google' ? ' — in use' : ''}</b><span>{canLive ? 'Reads the real Sheet.' : 'Available once the checklist below is complete.'} {live && !live.liveWritesEnabled ? 'Writing to the real Sheet is switched off in this version.' : ''}</span>
          </button>
        </div>
        <p className="small muted">{s.lastRead ? <>Last read {fmtTime(s.lastRead.at)} {s.lastRead.ok ? '· OK' : <b style={{ color: 'var(--bad)' }}>· failed: {s.lastRead.errorMessage}</b>}</> : 'Not read yet.'}</p>
      </section>

      <section>
        <h2>Connect the live Sheet</h2>
        {!live ? <p className="muted small">Checking…</p> : live.error ? <p className="small">{live.error}</p> : (
          <>
            <ol className="checklist">
              {live.steps.map((st: any) => <li key={st.key} className={st.done ? 'done' : ''}><span aria-hidden>{st.done ? '✓' : '○'}</span> {st.label}{st.detail && !st.done ? <div className="small muted">{st.detail}</div> : st.detail ? <span className="small muted"> · {st.detail}</span> : null}</li>)}
            </ol>
            {!live.steps[0].done && (
              <details className="small"><summary>How to set up the Google connection (about 10 minutes, once)</summary>
                <ol>
                  <li>Open console.cloud.google.com and create a project (or use an existing one). Turn on the “Google Sheets API”.</li>
                  <li>Under “APIs & Services → Credentials”, create an “OAuth client ID” of type “Web application”. Add this redirect address: <code>http://localhost:3100/api/google/callback</code>.</li>
                  <li>Copy the client ID and secret into the file <code>.env.local</code> in the studio folder (lines <code>GOOGLE_OAUTH_CLIENT_ID=…</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET=…</code>), then reopen the studio.</li>
                  <li>Come back here and press “Sign in with Google” with an account that can open the workbook. Never make the Sheet public.</li>
                </ol>
                <p>If you prefer, ask whoever helps with the setup to do steps 1–3; you only need to sign in.</p>
              </details>
            )}
            <div className="row">
              {live.googleAuthMode === 'oauth' && live.steps[0].done && <a className="btn small primary" href="/api/google/connect">{live.steps[1].done ? 'Sign in again' : 'Sign in with Google'}</a>}
              {live.steps[1].done && live.googleAuthMode === 'oauth' && <button className="btn small" onClick={async () => { await api('/api/google/signout', { body: {} }); toast('Signed out.'); loadLive(); reloadStatus(); }}>Sign out</button>}
              <button className="linkbtn" onClick={loadLive}>Check again</button>
            </div>
            <p className="small muted">Real Sheet writes stay switched off until a fresh live read, a conflict check and an explicitly authorised, labelled test have been done.</p>
          </>
        )}
      </section>

      <section>
        <h2>You</h2>
        <label className="field" style={{ maxWidth: 320 }}><span>Your name</span><input type="text" value={name} placeholder="e.g. Christian" onChange={(e) => setName(e.target.value)} /></label>
        <p className="small muted">Saved with your feedback and reviews. There is no sign-in: anyone using this computer can edit. Real accounts and permissions are needed before sharing the studio.</p>
        <button className="linkbtn" onClick={() => { safeSet('ws.introDismissed', '0'); toast('The short introduction will show again in the workspace.'); }}>Show the introduction again</button>
      </section>

      <section>
        <h2>Business name</h2>
        <div className="row"><input type="text" value={biz} maxLength={25} onChange={(e) => setBiz(e.target.value)} style={{ maxWidth: 260 }} aria-label="Business name" /><span className="small muted">{[...biz].length}/25</span>
          <button className="btn small" onClick={async () => { try { await api('/api/settings', { body: { businessName: biz } }); toast('Saved.'); bump(); } catch (e) { toast((e as Error).message); } }}>Save</button></div>
        <p className="small muted">Shown in previews. A shared setting, not ad copy.</p>
      </section>

      {ws && <section>
        <h2>What the workbook says</h2>
        <ul className="small">
          <li>{ws.workbookStatus.pmaxTabsMissingLongHeadline.length} Performance Max tabs are marked as missing a long headline ({ws.workbookStatus.pmaxTabsMissingLongHeadline.join(', ')}).</li>
          <li>{ws.workbookStatus.translationApprovalFlags} source lines carry “Needs translation approval” for Danish and/or German.</li>
        </ul>
      </section>}

      <details className="tech">
        <summary>Technical details</summary>
        <p className="small">Workbook ID <code>{s.spreadsheetId}</code> · local data in <code>{s.dataDir}</code> (back up with <code>npm run backup</code>).</p>
        {wb && <>
          <p className="small">{wb.counts.sourceIds} source IDs · {wb.counts.campaignTabs} campaign tabs · {wb.counts.updatesRows} rows in “Updates for Anabelle”.</p>
          {wb.limitations?.length > 0 && <ul className="small">{wb.limitations.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul>}
          <table className="t small"><thead><tr><th>Tab</th><th>Field</th><th>Column</th><th /></tr></thead><tbody>{wb.mappingChecks.map((c: any, i: number) => <tr key={i}><td>{c.tab}</td><td>{c.field}</td><td>{c.found ?? '—'}</td><td>{c.ok ? 'OK' : `expected ${c.expected}`}</td></tr>)}</tbody></table>
        </>}
        <h4>Sheet writes</h4>
        {s.attempts.length === 0 ? <p className="small muted">None yet.</p> : <table className="t small"><tbody>{s.attempts.map((a: any) => <tr key={a.id}><td>{fmtTime(a.startedAt)}</td><td>{a.mode}</td><td>{a.status.replace('_', ' ')}</td><td><code>{a.plan.cells.map((c: any) => c.ref).join(', ')}</code></td><td>{a.errorMessage ?? ''}</td></tr>)}</tbody></table>}
        <h4>Preview typography (approximate)</h4>
        <ul className="small">{Object.values(PLACEMENTS).map((p) => <li key={p.key}><b>{p.label}:</b> {p.basis}</li>)}</ul>
      </details>
    </div>
  );
}
