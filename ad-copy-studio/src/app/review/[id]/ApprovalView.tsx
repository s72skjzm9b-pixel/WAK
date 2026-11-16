'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, Tag, StateTag, SyncTag, Diff, fmtTime } from '@/components/client';
import { charCount } from '@/lib/limits';

const LANG_NAME: Record<string, string> = { EN: 'English', DK: 'Danish', DE: 'German' };

export function ApprovalView({ id }: { id: string }) {
  const { toast, role, bump, version, reloadStatus } = useStudio();
  const [v, setV] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const load = useCallback(async () => { try { setV(await api(`/api/revisions/${id}`)); setErr(null); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { load(); }, [load, version]);

  const act = async (action: string, body: any = {}) => {
    setBusy(true); setResult(null);
    try {
      const r = await api(`/api/revisions/${id}/${action}`, { body });
      if (r && typeof r.ok === 'boolean') setResult({ ok: r.ok, message: r.message });
      else toast('Done.');
      await load(); bump(); reloadStatus();
    } catch (e) { setResult({ ok: false, message: (e as Error).message }); } finally { setBusy(false); }
  };

  if (err) return <div className="notice bad">{err}</div>;
  if (!v) return <p className="muted">Loading approval details…</p>;
  const r = v.revision, item = v.item, plan = v.plan;
  const isApprover = /approver|reviewer/i.test(role);
  const conflictNow = r.kind === 'replace' && v.sheetNow !== null && v.sheetNow !== r.baseText && r.state !== 'written';
  const errors = v.validations.filter((x: any) => x.level === 'error');
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <Link href="/review" className="small">← Review</Link>
          <h1 style={{ marginTop: 4 }}>{r.kind === 'replace' ? 'Replace wording' : r.kind === 'variation' ? 'New variation' : 'Retire line'} · {r.sourceId} · {LANG_NAME[r.language]}</h1>
          <div className="row"><StateTag state={r.state} />{r.syncState !== 'none' && <SyncTag state={r.syncState} />}{r.isTest && <Tag tone="warn">Test item — excluded from exports</Tag>}<span className="small muted">Proposed by {r.createdBy} · {fmtTime(r.createdAt)}</span></div>
        </div>
      </div>

      {result && <div className={`notice ${result.ok ? 'ok' : 'bad'}`} role="alert">{result.message}</div>}
      {r.syncDetail && !result && <div className={`notice ${r.syncState === 'written' ? 'ok' : r.syncState === 'conflict' || r.syncState === 'failed' ? 'bad' : 'warn'}`}>{r.syncDetail}</div>}

      <div className="panel">
        <div className="compare">
          <div className="box"><h4>{r.kind === 'variation' ? 'Existing wording' : 'Previous wording (when proposed)'} <span className="small">{charCount(r.baseText)} chars</span></h4><div>{r.baseText || <i className="muted">— none (new line)</i>}</div></div>
          <div className="box proposed"><h4>{r.kind === 'retire' ? 'Proposed: retire this line' : 'Proposed wording — exact text to approve'} <span className="small">{charCount(r.proposedText)} chars</span></h4><div style={{ fontSize: 17 }}>{r.kind === 'retire' ? <s>{r.baseText}</s> : r.proposedText}</div></div>
        </div>
        {r.kind === 'replace' && <p className="small" style={{ marginTop: 8 }}>Change: <Diff a={r.baseText} b={r.proposedText} /></p>}
        {conflictNow && <div className="notice bad">The Sheet now reads “{v.sheetNow}”, not the wording this proposal was based on. Approving will not overwrite it; the write will stop with a conflict.</div>}
        <dl className="facts" style={{ marginTop: 12 }}>
          <dt>Source ID</dt><dd>{r.sourceId}{r.kind === 'variation' && ' (proposed new ID — not yet in the Sheet)'}</dd>
          <dt>Language</dt><dd>{LANG_NAME[r.language]}</dd>
          <dt>English basis</dt><dd>{r.language === 'EN' ? 'This is the English source' : r.englishBasis}{r.language !== 'EN' && item && r.englishBasis !== item.versions.EN.text && <> <Tag tone="bad">Differs from Sheet English: “{item.versions.EN.text}”</Tag></>}</dd>
          <dt>Reason</dt><dd>{r.reason || <span className="muted">No reason given</span>}</dd>
          {item && <><dt>Intended use</dt><dd>{item.intent} · {item.scope} · {item.destination}</dd>
            <dt>Usage / pairing rule</dt><dd>{item.usageRule}{item.linkedHeadline && <> · Linked headline: <b>{item.linkedHeadline}</b></>}</dd>
            <dt>Used in</dt><dd>{item.usages.filter((u: any) => u.language === r.language).map((u: any) => `${u.campaign} / ${u.group}`).join('; ') || 'No campaign tab in this language'}</dd></>}
          {r.kind === 'variation' && <><dt>Intended groups</dt><dd>{(r.meta.targets ?? []).map((t: any) => `${t.campaign} / ${t.group}`).join('; ') || <Tag tone="warn">None chosen — will not be distributed</Tag>}</dd><dt>Asset type</dt><dd>{r.meta.assetType}</dd></>}
        </dl>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Validation</h3>
          {v.validations.length === 0 ? <p className="small">No issues found.</p> : v.validations.map((x: any, i: number) => <div key={i} className={`notice ${x.level === 'error' ? 'bad' : x.level === 'warning' ? 'warn' : ''}`} style={{ marginBottom: 6 }}>{x.message}</div>)}
        </div>
        <div className="panel">
          <h3>Translation impact</h3>
          {r.language === 'EN' && r.kind === 'replace' ? v.translationImpact.map((t: any) => (
            <div key={t.lang} style={{ marginBottom: 8 }}><b>{LANG_NAME[t.lang]}:</b> {t.text || <i>not yet translated</i>}<div className="small muted">{t.effect}{t.openProposals ? ` ${t.openProposals} open ${LANG_NAME[t.lang]} proposal(s) will be sent back for re-review.` : ''}</div></div>
          )) : r.language !== 'EN' ? <p className="small">This approval covers this {LANG_NAME[r.language]} wording <b>and</b> the English it translates. If the English changes, the approval stops counting.</p> : <p className="small">No translation impact.</p>}
        </div>
      </div>

      {plan && (
        <div className="panel">
          <h3>{v.planIsHistorical ? 'What changed in the workbook' : 'What will change in the workbook'}</h3>
          {v.planIsHistorical ? <p className="small muted">The cells written by the successful attempt (values before the write are shown as “Now”).</p> : <p className="small muted">Planned against the Sheet read at {fmtTime(v.readAt)}. The app re-reads the Sheet immediately before writing and stops if anything differs. Only these cells are written (as plain values); formulas and formatting are untouched. The saved reference (Change reference C/E) is <b>not</b> advanced.</p>}
          <table className="t"><thead><tr><th>Cell</th><th>Column</th><th>Now</th><th>After</th><th>Why</th></tr></thead><tbody>
            {plan.cells.map((c: any) => <tr key={c.ref}><td className="mono">{c.ref}</td><td>{c.column}</td><td>{c.expectedBefore ?? <span className="muted">(any)</span>}</td><td><b>{c.after}</b></td><td className="small">{c.purpose}</td></tr>)}
          </tbody></table>
          {plan.predictions.length > 0 && (<>
            <h4 style={{ marginTop: 14 }}>Expected effect on “Updates for Anabelle” (from the workbook’s own formulas)</h4>
            <table className="t"><tbody>{plan.predictions.map((p: any) => <tr key={p.lang}><td>{p.sourceId} {p.lang}</td><td>{p.textChange}</td><td>{p.translationCheck}</td><td><b>{p.action}</b></td><td>{p.inUpdates ? <Tag tone="accent">Listed for Anabelle</Tag> : <Tag>Not listed</Tag>}</td></tr>)}</tbody></table>
          </>)}
          {plan.warnings.map((w: string, i: number) => <div key={i} className="notice warn" style={{ marginTop: 6 }}>{w}</div>)}
          {plan.blockers.map((w: string, i: number) => <div key={i} className="notice bad" style={{ marginTop: 6 }}>{w}</div>)}
        </div>
      )}
      {r.kind === 'variation' && <div className="notice warn">New variations are approved here but kept local in this release: the Updates for Anabelle FILTER only covers the existing Change reference rows, so appending a row would be invisible to her. See the README for registering a new ID by hand.</div>}

      <div className="panel">
        <h3>Decision</h3>
        {!isApprover && <div className="notice">Switch “Viewing as” to Approver to approve. (Role switching is a convenience, not access control.)</div>}
        {r.state === 'submitted' && (
          <div className="stack">
            <label className="field"><span>Approval note (optional)</span><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="row">
              {r.kind === 'replace' && <button className="btn primary" disabled={busy || !isApprover || errors.length > 0 || !v.canWrite} onClick={() => act('approve', { updateSheet: true, note })}>Approve and update Sheet</button>}
              <button className="btn" disabled={busy || !isApprover || errors.length > 0} onClick={() => act('approve', { updateSheet: false, note })}>{r.kind === 'replace' ? 'Approve only (Sheet unchanged)' : 'Approve (kept local)'}</button>
            </div>
            {r.kind === 'replace' && !v.canWrite && <p className="small muted">The current connection ({v.mode}) is read-only, so the Sheet cannot be updated from here. You can approve now and update the Sheet later.</p>}
            <div className="row">
              <input type="text" placeholder="What should change?" value={comment} onChange={(e) => setComment(e.target.value)} style={{ maxWidth: 420 }} />
              <button className="btn" disabled={busy || !comment.trim()} onClick={() => act('request-changes', { comment })}>Request changes</button>
            </div>
          </div>
        )}
        {r.state === 'approved' && (
          <div className="stack">
            <p>Approved {v.approval.approval ? `by ${v.approval.approval.approvedBy} at ${fmtTime(v.approval.approval.approvedAt)}` : ''}. {v.approval.valid ? <Tag tone="ok">Approval valid for this exact wording</Tag> : <Tag tone="bad">Approval invalid: {v.approval.reason}</Tag>}</p>
            {r.kind === 'replace' && <div className="row"><button className="btn primary" disabled={busy || !isApprover || !v.canWrite || !v.approval.valid} onClick={() => act('write')}>{r.syncState === 'failed' || r.syncState === 'conflict' ? 'Retry: update Sheet' : 'Update Sheet now'}</button><span className="small muted">Safe to retry — it re-checks the Sheet and never writes twice.</span></div>}
            <button className="btn" disabled={busy} onClick={() => act('request-changes', { comment: 'Re-opened after approval' })}>Re-open (withdraw approval)</button>
          </div>
        )}
        {r.state === 'written' && <p>Written to the Sheet and verified. Anabelle sees it in Handover with the exact previous and replacement text. <Link href="/handover">Go to Handover</Link></p>}
        {['draft', 'changes_requested'].includes(r.state) && <p className="muted">This proposal is with the copywriter. <Link href="/write">Open Write</Link></p>}
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>History</h3>
          <ul className="timeline">{v.events.map((e: any) => <li key={e.id}><b>{e.action.replace(/_/g, ' ')}</b> {e.to && e.from !== e.to ? `→ ${e.to}` : ''} <span className="muted">· {e.actor} · {fmtTime(e.at)}</span>{e.detail?.comment && <div className="small">“{e.detail.comment}”</div>}{e.detail?.from !== undefined && e.action === 'edited' && <div className="small"><Diff a={e.detail.from} b={e.detail.to} /></div>}</li>)}</ul>
        </div>
        <div className="panel">
          <h3>Sheet write attempts</h3>
          {v.attempts.length === 0 ? <p className="small muted">None yet.</p> : (
            <table className="t"><tbody>{v.attempts.map((a: any) => <tr key={a.id}><td className="small">{fmtTime(a.startedAt)}</td><td><Tag tone={a.status === 'succeeded' || a.status === 'already_applied' ? 'ok' : a.status === 'started' ? 'neutral' : 'bad'}>{a.status.replace('_', ' ')}</Tag></td><td className="small">{a.errorMessage || (a.verify?.visibleInUpdatesForAnabelle ? 'Verified: visible in Updates for Anabelle' : a.verify?.note || '')}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
