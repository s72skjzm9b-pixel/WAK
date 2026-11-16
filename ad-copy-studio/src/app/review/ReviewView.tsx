'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, Tag, StateTag, SyncTag, Diff, fmtTime } from '@/components/client';
import { PreviewCard, TypographyNote } from '@/components/AdPreview';
import { generateCombos, type Combo } from '@/lib/combos';
import { PLACEMENTS, placementsFor, type PlacementKey } from '@/lib/typography';

const FB_REASONS = ['Repetition', 'Unclear meaning', 'Wrong context', 'Tone', 'Translation', 'Factual concern', 'Too long when combined'];

export function ReviewView() {
  const [tab, setTab] = useState<'proposals' | 'combos' | 'feedback'>('proposals');
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Review</h1>
        <div className="seg" role="tablist">
          <button role="tab" aria-pressed={tab === 'proposals'} onClick={() => setTab('proposals')}>Copy approvals</button>
          <button role="tab" aria-pressed={tab === 'combos'} onClick={() => setTab('combos')}>Combinations</button>
          <button role="tab" aria-pressed={tab === 'feedback'} onClick={() => setTab('feedback')}>Feedback log</button>
        </div>
      </div>
      <p className="muted">Copy approval (exact wording of one line) and combination feedback (how lines read together) are separate decisions.</p>
      {tab === 'proposals' && <Proposals />}
      {tab === 'combos' && <Combinations />}
      {tab === 'feedback' && <FeedbackLog />}
    </div>
  );
}

function Proposals() {
  const { version } = useStudio();
  const [revs, setRevs] = useState<any[] | null>(null);
  useEffect(() => { api('/api/revisions').then((r) => setRevs(r.revisions)); }, [version]);
  if (!revs) return <p className="muted">Loading…</p>;
  const groups: { title: string; hint: string; list: any[] }[] = [
    { title: 'Waiting for approval', hint: 'Submitted by the copywriter.', list: revs.filter((r) => r.state === 'submitted') },
    { title: 'Approved — Sheet not updated', hint: 'Includes failed writes and conflicts. Approved wording is kept until resolved.', list: revs.filter((r) => r.state === 'approved') },
    { title: 'Changes requested', hint: 'Back with the copywriter (includes translations flagged by an English change).', list: revs.filter((r) => r.state === 'changes_requested') },
    { title: 'Drafts', hint: 'Local work in progress; not visible to Anabelle.', list: revs.filter((r) => r.state === 'draft') },
    { title: 'Written to the Sheet', hint: 'Canonical wording updated and verified.', list: revs.filter((r) => r.state === 'written').slice(0, 30) },
  ];
  return (
    <>
      {groups.map((g) => (
        <div className="panel" key={g.title}>
          <h2>{g.title} <span className="muted small">({g.list.length})</span></h2>
          <p className="small muted">{g.hint}</p>
          {g.list.length === 0 ? <div className="empty">Nothing here.</div> : (
            <table className="t"><thead><tr><th>Line</th><th>Type</th><th>Change</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>
              {g.list.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.sourceId}</b> {r.language}{r.isTest && <> <Tag tone="warn">Test</Tag></>}</td>
                  <td>{r.kind === 'replace' ? 'Replace wording' : r.kind === 'variation' ? 'New variation' : 'Retirement'}</td>
                  <td style={{ maxWidth: 520 }}>{r.kind === 'replace' ? <Diff a={r.baseText} b={r.proposedText} /> : r.kind === 'retire' ? <s>{r.baseText}</s> : r.proposedText}</td>
                  <td><div className="stack" style={{ gap: 4 }}><StateTag state={r.state} />{r.syncState !== 'none' && <SyncTag state={r.syncState} />}</div></td>
                  <td className="small muted">{fmtTime(r.updatedAt)}<br />{r.createdBy}</td>
                  <td><Link className="btn small" href={`/review/${r.id}`}>{r.state === 'submitted' ? 'Review' : 'Open'}</Link></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      ))}
    </>
  );
}

function Combinations() {
  const { version, toast, role } = useStudio();
  const [lib, setLib] = useState<any>(null);
  const [campaign, setCampaign] = useState('');
  const [group, setGroup] = useState('');
  const [overlay, setOverlay] = useState(true);
  const [data, setData] = useState<any>(null);
  const [n, setN] = useState(6);
  const [placement, setPlacement] = useState<PlacementKey>('search-desktop');
  const [feedback, setFeedback] = useState<any[]>([]);
  const [onlyItem, setOnlyItem] = useState('');
  useEffect(() => { api('/api/library').then((l) => { setLib(l); if (!campaign && l.campaigns.length) { setCampaign(l.campaigns[0].name); setGroup(l.campaigns[0].groups[0] ?? ''); } }); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const camp = lib?.campaigns.find((c: any) => c.name === campaign);
  const load = useCallback(async () => {
    if (!campaign || !group) return;
    setData(await api(`/api/group?campaign=${encodeURIComponent(campaign)}&group=${encodeURIComponent(group)}&overlay=${overlay ? 1 : 0}`));
    setFeedback((await api('/api/feedback')).feedback);
  }, [campaign, group, overlay]);
  useEffect(() => { load(); setN(6); }, [load, version]);
  useEffect(() => { if (camp) setPlacement(placementsFor(camp.format)[0]); }, [camp?.format]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => data ? generateCombos(data.ctx, new Map(Object.entries(data.englishHeadlines))) : null, [data]);
  const list = (res?.all ?? []).filter((c) => !onlyItem || c.slots.some((s) => s.sourceId === onlyItem));
  const setPin = async (sourceId: string, position: string) => {
    try { await api('/api/pins', { body: { campaign, group, sourceId, position } }); await load(); toast(position ? `Pinning proposal: ${sourceId} → ${position}` : `${sourceId} unpinned`); } catch (e) { toast((e as Error).message); }
  };
  if (!lib) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <div className="panel">
        <div className="grid3">
          <label className="field"><span>Campaign tab</span>
            <select value={campaign} onChange={(e) => { setCampaign(e.target.value); setGroup(lib.campaigns.find((c: any) => c.name === e.target.value)?.groups[0] ?? ''); }}>
              {lib.campaigns.map((c: any) => <option key={c.name} value={c.name}>{c.name} — {c.format === 'search' ? 'Search' : c.format === 'pmax' ? 'Performance Max' : c.format === 'demand_gen' ? 'Demand Gen' : c.format} · {c.language}</option>)}
            </select>
          </label>
          <label className="field"><span>{camp?.format === 'search' ? 'Ad group / section' : 'Asset group / section'}</span>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>{camp?.groups.map((g: string) => <option key={g}>{g}</option>)}</select>
          </label>
          <label className="field"><span>Only combinations containing</span>
            <select value={onlyItem} onChange={(e) => setOnlyItem(e.target.value)}><option value="">Any line</option>{data?.ctx.assets.map((a: any) => <option key={a.sourceId} value={a.sourceId}>{a.sourceId} — {a.text.slice(0, 40)}</option>)}</select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="small row"><input type="checkbox" style={{ width: 'auto' }} checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Include proposals in review (shown highlighted)</label>
          {camp && <div className="seg" role="group" aria-label="Placement">{placementsFor(camp.format).map((p) => <button key={p} aria-pressed={placement === p} onClick={() => setPlacement(p)}>{PLACEMENTS[p].label}</button>)}</div>}
        </div>
        {data?.mapRow && <p className="small muted" style={{ marginTop: 10 }}>Campaign map: {data.mapRow.intent} · {data.mapRow.marketLanguage} · {data.mapRow.rule}</p>}
      </div>

      {camp?.format === 'search' && data && (
        <div className="panel">
          <h3>Pinning proposal for this ad group</h3>
          <p className="small muted">Previews respect what you set here. It is a proposal only; nothing is pinned in Google Ads, and “La Cabra” is not pinned first by default. Assets pinned to the same position rotate there.</p>
          <table className="t"><tbody>
            {data.ctx.assets.map((a: any) => (
              <tr key={a.sourceId}><td><b>{a.sourceId}</b></td><td>{a.assetType}</td><td>{a.text}</td><td>
                <select aria-label={`Pin ${a.sourceId}`} value={data.ctx.pins[a.sourceId] ?? ''} onChange={(e) => setPin(a.sourceId, e.target.value)} style={{ width: 140 }}>
                  <option value="">Not pinned</option>
                  {(/headline/i.test(a.assetType) ? ['H1', 'H2', 'H3'] : ['D1', 'D2']).map((p) => <option key={p} value={p}>Pin to {p}</option>)}
                </select>
              </td></tr>
            ))}
          </tbody></table>
        </div>
      )}
      {camp && camp.format !== 'search' && <div className="notice">Performance Max / Demand Gen: no Search-style pinning. Every asset must read well with every other asset in its group.</div>}

      <div className="notice warn">Marking a preview “Needs changes” does not stop Google from showing that combination. Resolve it by changing an asset, removing one, or separating incompatible assets into different groups.</div>
      {data && <TypographyNote placement={placement} />}
      {res && <p className="small muted">Showing {Math.min(n, list.length)} of {list.length.toLocaleString()} illustrative combinations{res.truncated ? ' (enumeration capped)' : ''}. {res.notes.join(' ')}</p>}
      {camp?.gaps?.filter((g: any) => true).map((g: any, i: number) => <div key={i} className="notice bad">Gap in {camp.name}: {g.assetType} — {g.note}</div>)}
      <div className="gallery">
        {list.slice(0, n).map((c) => <PreviewCard key={c.key} combo={c} placement={placement} destination={data?.mapRow?.destination}><FeedbackBox combo={c} existing={feedback.filter((f) => f.comboKey === c.key)} onSaved={load} role={role} /></PreviewCard>)}
      </div>
      {list.length === 0 && res && <div className="empty">No illustrative combinations for this group. {res.notes.join(' ')}</div>}
      {list.length > n && <button className="btn" onClick={() => setN(n + 6)}>Show more combinations</button>}
    </div>
  );
}

function FeedbackBox({ combo, existing, onSaved, role }: { combo: Combo; existing: any[]; onSaved: () => void; role: string }) {
  const { toast } = useStudio();
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<'works' | 'needs_changes' | 'comment'>('works');
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const save = async () => {
    try { await api('/api/feedback', { body: { combo, verdict, reasons, comment } }); toast('Feedback saved against these exact text versions.'); setOpen(false); setReasons([]); setComment(''); onSaved(); } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="fb">
      {existing.map((f) => (
        <div key={f.id} className="small" style={{ marginBottom: 6 }}>
          <Tag tone={f.verdict === 'works' ? 'ok' : f.verdict === 'needs_changes' ? 'warn' : 'neutral'}>{f.verdict === 'works' ? 'Works' : f.verdict === 'needs_changes' ? 'Needs changes' : 'Comment'}</Tag>{' '}
          {f.reasons.join(', ')} {f.comment && `— ${f.comment}`} <span className="muted">· {f.reviewer}, {fmtTime(f.createdAt)}</span>
          {f.changedSince.length > 0 && <div><Tag tone="warn">Wording changed since this feedback</Tag> {f.changedSince.map((c: any) => `${c.sourceId}: “${c.then}” → “${c.now ?? 'removed'}”`).join('; ')}</div>}
          {f.resolvedAt && <Tag tone="neutral">Resolved</Tag>}
        </div>
      ))}
      {!open ? <button className="btn small" onClick={() => setOpen(true)}>Give feedback…</button> : (
        <div className="stack" style={{ gap: 8 }}>
          <div className="seg" role="group" aria-label="Verdict">
            <button aria-pressed={verdict === 'works'} onClick={() => setVerdict('works')}>Works</button>
            <button aria-pressed={verdict === 'needs_changes'} onClick={() => setVerdict('needs_changes')}>Needs changes</button>
            <button aria-pressed={verdict === 'comment'} onClick={() => setVerdict('comment')}>Comment only</button>
          </div>
          {verdict !== 'works' && <div className="chips">{FB_REASONS.map((r) => <button key={r} className="chip" aria-pressed={reasons.includes(r)} onClick={() => setReasons(reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons, r])}>{r}</button>)}</div>}
          <textarea rows={2} placeholder="Comment (what should change, or why it works)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="row"><button className="btn small primary" onClick={save}>Save feedback as {role}</button><button className="btn small" onClick={() => setOpen(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}

function FeedbackLog() {
  const { version, toast } = useStudio();
  const [fb, setFb] = useState<any[] | null>(null);
  const load = useCallback(() => api('/api/feedback').then((r) => setFb(r.feedback)), []);
  useEffect(() => { load(); }, [load, version]);
  if (!fb) return <p className="muted">Loading…</p>;
  if (!fb.length) return <div className="empty">No combination feedback yet.</div>;
  return (
    <div className="panel">
      <table className="t"><thead><tr><th>Combination (exact text reviewed)</th><th>Feedback</th><th>Since then</th><th /></tr></thead><tbody>
        {fb.map((f) => (
          <tr key={f.id}>
            <td><div className="small muted">{f.combo.campaign} / {f.combo.group} · {f.combo.language}</div>{f.combo.slots.map((s: any) => <div key={s.slot}><b>{s.slot}</b> {s.sourceId}: {s.text}</div>)}</td>
            <td><Tag tone={f.verdict === 'works' ? 'ok' : f.verdict === 'needs_changes' ? 'warn' : 'neutral'}>{f.verdict === 'works' ? 'Works' : f.verdict === 'needs_changes' ? 'Needs changes' : 'Comment only'}</Tag><div className="small">{f.reasons.join(', ')}</div><div>{f.comment}</div><div className="small muted">{f.reviewer} · {fmtTime(f.createdAt)}</div></td>
            <td>{f.changedSince.length ? <><Tag tone="warn">Wording changed</Tag>{f.changedSince.map((c: any) => <div key={c.slot} className="small">{c.sourceId}: <Diff a={c.then} b={c.now ?? ''} /></div>)}</> : <span className="small muted">Unchanged</span>}</td>
            <td>{f.resolvedAt ? <Tag>Resolved: {f.resolution}</Tag> : <button className="btn small" onClick={async () => { const r = prompt('How was it resolved? (changed an asset, removed one, separated groups…)'); if (r) { await api(`/api/feedback/${f.id}/resolve`, { body: { resolution: r } }); toast('Marked resolved.'); load(); } }}>Mark resolved</button>}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
