'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, Tag, Diff, fmtTime } from '@/components/client';

const LANG_NAME: Record<string, string> = { EN: 'English', DK: 'Danish', DE: 'German' };
const DEP_LABEL: Record<string, string> = {
  missing_translation: 'Missing translation', approval_invalid: 'Approval no longer valid', sheet_changed: 'Sheet changed after approval',
  variation_unassigned: 'Variation without groups', variation_unregistered: 'New ID not in Sheet', translation_recheck: 'Translation needs re-review',
  translation_pending_english: 'English change in review', missing_asset: 'Missing asset', seasonal_gap: 'Seasonal copy missing', destination: 'Landing URL to confirm',
  combination_feedback: 'Combination needs changes', write_pending: 'Approved, Sheet not updated', write_failed: 'Sheet write failed', write_conflict: 'Sheet conflict',
};

export function HandoverView() {
  const { version, toast, bump, reloadStatus } = useStudio();
  const [f, setF] = useState({ market: '', language: '', campaign: '' });
  const [h, setH] = useState<any>(null);
  const [lib, setLib] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
      setH(await api(`/api/handover?${q}`)); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [f]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { api('/api/library').then(setLib).catch(() => {}); }, [version]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(h.text); toast('Copied to clipboard.'); } catch { toast('Clipboard not available — select the text below and copy.'); }
  };
  const exportCsv = async () => {
    try {
      const b = await api('/api/handover/export', { body: f });
      window.location.href = `/api/handover/batches/${b.id}`;
      toast(`Export batch created: ${b.rows} rows.`); load();
    } catch (e) { toast((e as Error).message); }
  };
  const ack = async (r: any) => {
    if (!confirm(`Confirm you have applied “${r.replacementText}” in Google Ads.\n\nThis records your acknowledgement. The app cannot verify Google Ads.`)) return;
    try { await api('/api/acks', { body: { revisionId: r.revisionId, sourceId: r.sourceId, language: r.language, appliedText: r.replacementText } }); toast('Acknowledged. The saved reference is not advanced yet.'); load(); } catch (e) { toast((e as Error).message); }
  };
  const ackSheetRow = async (u: any) => {
    if (!confirm(`Confirm you have applied “${u.current}” (${u.sourceId} ${u.lang}) in Google Ads.\n\nThis records your acknowledgement only.`)) return;
    try { await api('/api/acks', { body: { sourceId: u.sourceId, language: u.lang, appliedText: u.current } }); toast('Acknowledged.'); load(); } catch (e) { toast((e as Error).message); }
  };
  const advance = async (ackId: string) => {
    if (!confirm('Advance the saved reference for this row?\n\nThis copies the current wording into Change reference (previous wording / English at reference), so the row leaves “Updates for Anabelle”. It records your acknowledgement — it is not an independent check of Google Ads.')) return;
    try { const r = await api(`/api/acks/${ackId}/advance`, { body: {} }); toast(r.message); load(); bump(); reloadStatus(); } catch (e) { toast((e as Error).message); }
  };

  if (err) return <div className="notice bad">{err}</div>;
  if (!h) return <p className="muted">Building handover…</p>;
  const markets = [...new Set((lib?.campaigns ?? []).map((c: any) => c.market))] as string[];
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 style={{ margin: 0 }}>Handover for Anabelle</h1><p className="muted" style={{ margin: 0 }}>Only exactly approved wording. Drafts and proposals are never included.</p></div>
        <div className="row"><button className="btn" onClick={copy}>Copy to clipboard</button><button className="btn primary" onClick={exportCsv}>Create dated export batch (CSV)</button></div>
      </div>
      {h.mode !== 'google' && <div className={`notice ${h.mode === 'sandbox' ? 'warn' : ''}`}>{h.mode === 'sandbox' ? 'Sandbox mode: this handover reflects the local practice copy, not the real Sheet. Exports are labelled SANDBOX.' : `Snapshot mode: based on the workbook as captured ${fmtTime(h.readAt)}. Connect the live Sheet before handing over.`}</div>}
      <div className="panel">
        <div className="grid3">
          <label className="field"><span>Market</span><select value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })}><option value="">All</option>{markets.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="field"><span>Language</span><select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="">All</option>{['EN', 'DK', 'DE'].map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}</select></label>
          <label className="field"><span>Campaign (eligible group)</span><select value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value })}><option value="">All</option>{(lib?.campaigns ?? []).filter((c: any) => !f.market || c.market === f.market).map((c: any) => <option key={c.name}>{c.name}</option>)}</select></label>
        </div>
        <div className="kpis" style={{ marginTop: 14 }}>
          <div className="kpi"><b>{h.replacements.length}</b>Replacements to apply</div>
          <div className="kpi"><b>{h.variations.length}</b>Approved new variations</div>
          <div className="kpi"><b>{h.approved.length}</b>Approved lines in groups</div>
          <div className="kpi"><b>{h.dependencies.length}</b>Unresolved dependencies</div>
          <div className="kpi"><b>{h.excluded.notApproved}</b>Lines not yet approved (excluded)</div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Excluded: {h.excluded.drafts} drafts/proposals in review, {h.excluded.tests} test items. CSV is a review/handover file — it has not been validated as a Google Ads Editor import.</p>
      </div>

      <div className="panel">
        <h2>Replacements — exact previous and replacement text</h2>
        <p className="small muted">Written to the Sheet and approved. Acknowledging application is a separate step from approval, and advancing the saved reference is a separate step again.</p>
        {h.replacements.length === 0 ? <div className="empty">No approved replacements waiting.</div> : h.replacements.map((r: any) => (
          <div key={r.revisionId} style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
            <div className="row"><b>{r.sourceId} · {LANG_NAME[r.language]}</b><span className="small muted">Approved {fmtTime(r.approvedAt)} · written {fmtTime(r.writtenAt)}</span>{r.acknowledged ? <Tag tone="ok">Applied (acknowledged {fmtTime(r.acknowledged.at)})</Tag> : <Tag tone="warn">Not yet acknowledged as applied</Tag>}</div>
            <dl className="facts" style={{ marginTop: 6 }}>
              <dt>Previous</dt><dd>{r.previousText}</dd>
              <dt>Replacement</dt><dd><b>{r.replacementText}</b></dd>
              <dt>Change</dt><dd><Diff a={r.previousText} b={r.replacementText} /></dd>
              {r.language !== 'EN' && <><dt>English basis</dt><dd>{r.englishBasis}</dd></>}
              <dt>Where</dt><dd>{r.usages.map((u: any) => `${u.campaign} / ${u.group}`).join('; ') || 'Not used in a campaign tab'}</dd>
            </dl>
            <div className="row" style={{ marginTop: 8 }}>
              {!r.acknowledged && <button className="btn small" onClick={() => ack(r)}>I applied this in Google Ads</button>}
              {r.acknowledged && r.acknowledged.referenceState !== 'advanced' && <button className="btn small" onClick={() => advance(r.acknowledged.id)}>Advance saved reference…</button>}
              {r.acknowledged?.referenceState === 'conflict' || r.acknowledged?.referenceState === 'failed' ? <Tag tone="bad">Reference not advanced</Tag> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Approved new variations</h2>
        <p className="small muted">Add alongside existing assets — nothing is replaced. Kept in the studio; the new IDs are not registered in the Sheet yet.</p>
        {h.variations.length === 0 ? <div className="empty">None.</div> : <table className="t"><thead><tr><th>Proposed ID</th><th>Language</th><th>Type</th><th>Text</th><th>Intended for</th></tr></thead><tbody>
          {h.variations.map((v: any) => <tr key={v.revisionId}><td>{v.proposedId}</td><td>{v.language}</td><td>{v.assetType}</td><td><b>{v.text}</b></td><td>{v.targets.map((t: any) => `${t.campaign} / ${t.group}`).join('; ') || <Tag tone="warn">No group chosen</Tag>}</td></tr>)}
        </tbody></table>}
        {h.retirements.length > 0 && <><h3 style={{ marginTop: 14 }}>Approved retirements</h3><table className="t"><tbody>{h.retirements.map((r: any) => <tr key={r.revisionId}><td>{r.sourceId} {r.language}</td><td><s>{r.text}</s></td><td>{r.usages.map((u: any) => `${u.campaign} / ${u.group}`).join('; ')}</td><td className="small">{r.reason}</td></tr>)}</tbody></table></>}
      </div>

      <div className="panel">
        <h2>Approved copy by eligible group</h2>
        {h.approved.length === 0 ? <div className="empty">No wording in these groups has been approved yet. (Sheet wording is not approval.) Approvers can approve current wording “as is” from the Write view.</div> : (
          <table className="t"><thead><tr><th>Campaign / group</th><th>ID</th><th>Type</th><th>Language</th><th>Approved text</th><th>Approved</th></tr></thead><tbody>
            {h.approved.map((a: any, i: number) => <tr key={i}><td>{a.campaign} / {a.group}</td><td>{a.sourceId}</td><td>{a.assetType}</td><td>{a.language}</td><td>{a.text}</td><td className="small muted">{fmtTime(a.approvedAt)}</td></tr>)}
          </tbody></table>
        )}
      </div>

      <div className="panel">
        <h2>Unresolved dependencies</h2>
        {h.dependencies.length === 0 ? <div className="empty">None for this selection.</div> : (
          <table className="t"><tbody>{h.dependencies.map((d: any, i: number) => <tr key={i}><td><Tag tone={/conflict|failed|invalid|sheet_changed/.test(d.kind) ? 'bad' : 'warn'}>{DEP_LABEL[d.kind] ?? d.kind}</Tag></td><td className="small">{[d.campaign, d.group, d.sourceId, d.language].filter(Boolean).join(' · ')}</td><td>{d.detail}</td></tr>)}</tbody></table>
        )}
      </div>

      <div className="panel">
        <h2>Updates for Anabelle — as the Sheet shows it now</h2>
        <p className="small muted">Read from the workbook’s own comparison tab. Includes changes made directly in the Sheet. This is a comparison with the saved reference, not proof of what is live.</p>
        {h.updatesInSheet.length === 0 ? <div className="empty">“No changes since the saved reference.”</div> : (
          <table className="t"><thead><tr><th>ID</th><th>Lang</th><th>Previous</th><th>Current</th><th>Action</th><th /></tr></thead><tbody>
            {h.updatesInSheet.map((u: any, i: number) => <tr key={i}><td>{u.sourceId}</td><td>{u.lang}</td><td>{u.previous}</td><td>{u.current}</td><td>{u.action}</td><td>{u.action.startsWith('Approved') && <button className="btn small" onClick={() => ackSheetRow(u)}>I applied this</button>}</td></tr>)}
          </tbody></table>
        )}
        <AckList />
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>Export batches</h2>
          {h.batches.length === 0 ? <p className="small muted">No exports yet.</p> : <table className="t"><tbody>{h.batches.map((b: any) => <tr key={b.id}><td><a href={`/api/handover/batches/${b.id}`}>{b.label}.csv</a></td><td className="small">{b.rowCount} rows · {b.mode}</td><td className="small muted">{fmtTime(b.createdAt)}</td></tr>)}</tbody></table>}
          <p className="small muted">Each batch stores the exact text fingerprints, approval IDs and Sheet read it was built from.</p>
        </div>
        <div className="panel">
          <h2>Plain-text handover</h2>
          <textarea readOnly rows={12} value={h.text} className="mono" />
        </div>
      </div>
      <p className="small muted">Need to change copy? <Link href="/write">Write</Link> · Review combinations in <Link href="/review">Review</Link>.</p>
    </div>
  );
}

function AckList() {
  const { version, toast, bump } = useStudio();
  const [acks, setAcks] = useState<any[]>([]);
  const load = useCallback(() => api('/api/acks').then((r) => setAcks(r.acks)), []);
  useEffect(() => { load(); }, [load, version]);
  const pending = acks.filter((a) => a.referenceState !== 'advanced' && !a.revisionId);
  if (!pending.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <h4>Acknowledged rows from the Sheet</h4>
      {pending.map((a) => (
        <div key={a.id} className="row small" style={{ marginBottom: 6 }}>
          <span>{a.sourceId} {a.language}: “{a.appliedText}” · {a.acknowledgedBy} {fmtTime(a.acknowledgedAt)}</span>
          {a.referenceState !== 'not_advanced' && <Tag tone="bad">{a.referenceDetail}</Tag>}
          <button className="btn small" onClick={async () => { if (!confirm('Advance the saved reference? This records acknowledgement, not verification of Google Ads.')) return; try { const r = await api(`/api/acks/${a.id}/advance`, { body: {} }); toast(r.message); load(); bump(); } catch (e) { toast((e as Error).message); } }}>Advance saved reference…</button>
        </div>
      ))}
    </div>
  );
}
