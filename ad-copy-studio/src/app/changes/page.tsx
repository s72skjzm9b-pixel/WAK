'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, Diff, fmtTime } from '@/components/client';
import { rowsFor, translationNeedsReview, type WCollection } from '@/lib/workspace';
import { limitFor, charCount } from '@/lib/limits';
import { stageOf, impactOf, handoffItems } from '@/lib/handoff';

export default function ChangesPage() {
  const { version, toast, bump, ask, ensureName } = useStudio();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setD(await api('/api/workspace')), []);
  useEffect(() => { load(); }, [load, version]);
  if (!d) return <p className="muted">Loading…</p>;

  const cols: WCollection[] = d.collections;
  const langName = (c: string) => d.languages.find((l: any) => l.code === c)?.name ?? c;
  const colName = (s: any) => s.collection ? (cols.find((c) => c.key === s.collection)?.name ?? 'Ideas and unassigned') : cols.filter((c) => c.sourceIds.includes(s.sourceId)).map((c) => c.name).join(', ') || 'Ideas and unassigned';
  const reviewFlag = (s: any) => {
    if (s.language === 'EN') return false;
    const c = cols.find((x) => x.key === s.collection) ?? cols.find((x) => x.sourceIds.includes(s.sourceId));
    const row = c ? rowsFor(c, d).find((r) => r.sourceId === s.sourceId) : null;
    return row ? translationNeedsReview(row, s.language, {}) : false;
  };
  const tooLong = (s: any) => {
    const item = d.items.find((i: any) => i.sourceId === s.sourceId);
    const type = s.meta?.assetType ?? item?.assetType ?? '';
    const c = cols.find((x) => x.key === s.collection);
    const fmts: string[] = item ? item.usages.filter((u: any) => u.language === s.language).map((u: any) => u.format) : [...(c?.formats[s.language] ?? []), ...(c?.intendedFormats ?? [])];
    const lims = fmts.map((f) => limitFor(type, f as any)).filter((x) => x?.verified) as { max: number }[];
    const max = Math.min(...lims.map((x) => x.max), Infinity);
    return Number.isFinite(max) && charCount(s.proposedText) > max ? `${charCount(s.proposedText)} of ${max} characters — too long. Shorten it in the workspace.` : null;
  };
  const provText = (s: any) => s.provenance ? `Based on ${s.provenance.mode === 'google' ? 'the live Sheet' : s.provenance.mode === 'sandbox' ? 'the practice copy' : 'the snapshot'} read ${fmtTime(s.provenance.at)}${s.provenance.mode !== 'google' ? ' · a live comparison is required before any real write' : ''}` : '';

  const act = async (id: string, action: string, body: any = {}) => {
    if (!(await ensureName())) return;
    setBusy(id);
    try {
      const r = await api(`/api/revisions/${id}/${action}`, { body });
      if (r && typeof r.ok === 'boolean') toast(r.ok ? r.message : `Not done: ${r.message}`);
      await load(); bump();
    } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  };
  const returnIt = async (id: string) => {
    const r = await ask({ title: 'Return for editing', body: 'The wording stays as it is; the copywriter sees your note.', input: { label: 'Note (optional)', multiline: true }, actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Return', value: 'ok', primary: true }] });
    if (r.value === 'ok') act(id, 'return', { comment: r.text });
  };
  const discard = async (s: any) => {
    const r = await ask({ title: 'Discard this suggestion?', body: s.kind === 'replace' ? 'The Sheet wording stays as it is. The suggestion is kept in history.' : 'The new line is removed from the list. It is kept in history.', actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Discard', value: 'ok', danger: true }] });
    if (r.value === 'ok') act(s.id, 'revert');
  };
  const markDone = async (row: any) => {
    const isNew = row.todo === 'Add new copy';
    const r = await ask({ title: isNew ? 'Mark as registered?' : 'Mark as applied in Google Ads?', body: isNew ? 'Use this once the new line has been added to the Sheet and Google Ads. It moves to history.' : 'This records your confirmation and clears the row from “Updates for Anabelle” in the Sheet when connected. The studio cannot check Google Ads itself.', actions: [{ label: 'Cancel', value: 'cancel' }, { label: isNew ? 'Mark as registered' : 'Mark as applied', value: 'ok', primary: true }] });
    if (r.value === 'ok') act(row.id, 'applied');
  };

  const by = (stage: string) => d.suggestions.filter((s: any) => stageOf(s) === stage);
  const drafts = by('draft'), ready = by('ready'), approved = by('approved');
  const todo = handoffItems(d);
  const history = d.suggestions.filter((s: any) => ['applied', 'history'].includes(stageOf(s))).sort((a: any, b: any) => (b.appliedAt ?? b.updatedAt).localeCompare(a.appliedAt ?? a.updatedAt));
  const groupBy = (list: any[]) => {
    const m = new Map<string, any[]>();
    for (const s of list) { const k = `${colName(s)} · ${langName(s.language)}`; m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  };

  const Item = ({ s, children, showImpact }: { s: any; children?: React.ReactNode; showImpact?: boolean }) => {
    const impact = impactOf(d, s.sourceId, s.language);
    return (
      <div className="change">
        <div className="changemeta"><span>{s.kind === 'variation' ? (s.meta?.separatedFrom ? 'Separate version' : 'New copy') : s.kind === 'retire' ? 'Remove' : 'Edit'} · {s.meta?.assetType ?? d.items.find((i: any) => i.sourceId === s.sourceId)?.assetType ?? ''}</span><span className="muted">{fmtTime(s.updatedAt)}</span><span className="rowid">{s.sourceId}</span></div>
        {s.kind === 'variation' ? <p className="changetext">{s.proposedText}</p>
          : s.kind === 'retire' ? <p className="changetext"><s>{s.baseText}</s></p>
          : <div className="oldnew"><div><span className="lbl">Was</span>{s.baseText || <i className="muted">empty</i>}</div><div><span className="lbl">Now</span>{s.proposedText}</div><div className="small muted"><Diff a={s.baseText} b={s.proposedText} /></div></div>}
        {tooLong(s) && <p className="small" style={{ color: 'var(--bad)', margin: '4px 0' }}>{tooLong(s)}</p>}
        {reviewFlag(s) && <p className="small warntext">Translation needs checking against the current English.</p>}
        {s.language === 'EN' && s.kind === 'replace' && ['DK', 'DE'].some((l) => d.items.find((i: any) => i.sourceId === s.sourceId)?.versions[l]?.text) && <p className="small muted">The Danish and German versions will need review against this English.</p>}
        {!s.canonicalLanguage && <p className="small muted">{langName(s.language)} has no column in the master Sheet — this stays local only.</p>}
        {s.needsIntendedUse && <p className="small warntext">Needs intended use — choose where it belongs in the workspace.</p>}
        {s.state === 'changes_requested' && <p className="small warntext">Returned for editing{s.returnedNote ? `: “${s.returnedNote}”` : ''}</p>}
        {showImpact && <details className="small impact"><summary>{impact.summary}</summary><ul>{impact.groups.map((g, i) => <li key={i}>{g.campaign} / {g.group} · {g.format}</li>)}{impact.studio.map((u, i) => <li key={`s${i}`}>Studio use: {u.collection}{u.format ? ` (${u.format})` : ''}</li>)}</ul></details>}
        {provText(s) && <p className="small muted prov">{provText(s)}</p>}
        {children}
      </div>
    );
  };

  return (
    <div className="changes">
      <h1>Changes</h1>
      <p className="muted">{d.connection.approveNote}</p>

      {ready.length > 0 && <section><h2>Ready for review <span className="muted small">{ready.length}</span></h2>
        {groupBy(ready).map(([g, list]) => <div key={g}><h3 className="grp">{g}</h3>{list.map((s: any) => (
          <Item key={s.id} s={s} showImpact>
            <div className="row">
              <button className="btn small primary" disabled={busy === s.id || !!tooLong(s)} onClick={() => act(s.id, 'accept')}>{s.approveLabel}</button>
              <button className="btn small" disabled={busy === s.id} onClick={() => returnIt(s.id)}>Return for editing</button>
              <button className="linkbtn" onClick={() => discard(s)}>Discard</button>
            </div>
          </Item>))}</div>)}
      </section>}

      {approved.length > 0 && <section><h2>Approved locally — waiting for the Sheet</h2>
        {approved.map((s: any) => (
          <Item key={s.id} s={s}>
            {s.syncState === 'conflict' ? (
              <div className="conflict">
                <p><b>The Sheet changed after this suggestion was made.</b> Nothing was overwritten.</p>
                <div className="oldnew"><div><span className="lbl">Sheet now</span>{d.items.find((i: any) => i.sourceId === s.sourceId)?.versions[s.language]?.text}</div><div><span className="lbl">Yours</span>{s.proposedText}</div></div>
                <div className="row"><button className="btn small" onClick={() => act(s.id, 'keep-current')}>Keep mine (review again)</button><button className="linkbtn" onClick={() => discard(s)}>Discard mine, keep the Sheet</button></div>
              </div>
            ) : (
              <p className="small muted">{!s.canonicalLanguage ? 'Local only.' : d.mode === 'snapshot' ? 'Saved locally. The Sheet will be updated only from a live connection with writes enabled.' : s.syncState === 'failed' ? `Couldn’t update the Sheet: ${s.syncDetail}` : 'The Sheet is not updated yet.'}
                {s.canonicalLanguage && d.canWrite && <> <button className="btn small" disabled={busy === s.id} onClick={() => act(s.id, 'write')}>{d.mode === 'sandbox' ? 'Write to practice copy' : 'Update Sheet now'}</button></>}</p>
            )}
          </Item>
        ))}
      </section>}

      <section>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>To apply in Google Ads <span className="muted small">{todo.length}</span></h2>
          {todo.length > 0 && <div className="row"><button className="btn small" onClick={async () => { const r = await api('/api/changes/export'); try { await navigator.clipboard.writeText(r.text); toast('List copied.'); } catch { toast('Clipboard not available.'); } }}>Copy list</button><a className="btn small" href="/api/changes/export?format=csv">Download CSV</a></div>}
        </div>
        <p className="small muted">For Anabelle: old → new wording and exactly where it applies. Done items leave this list immediately. This list is not a Google Ads import file.</p>
        {todo.length === 0 ? <p className="muted">Nothing to apply.</p> : groupBy(todo.map((t) => ({ ...d.suggestions.find((s: any) => s.id === t.id), _t: t }))).map(([g, list]) => <div key={g}><h3 className="grp">{g}</h3>{list.map((s: any) => (
          <Item key={s.id} s={s}>
            <p className="small"><b>{s._t.todo}</b> · {s._t.whereText}</p>
            <div className="row small">
              <span className={`qtag ${s.state === 'written' ? 'ok' : 'warn'}`}>{s._t.sheetState}</span>
              <button className="btn small" onClick={() => markDone(s._t)}>{s._t.todo === 'Add new copy' ? 'Mark as registered' : 'Mark as applied'}</button>
            </div>
          </Item>))}</div>)}
      </section>

      {drafts.length > 0 && <section><h2>Drafts <span className="muted small">{drafts.length}</span></h2>
        <p className="small muted">Still being written. Mark a draft “Ready for review” in the workspace (or here) when it’s finished.</p>
        {groupBy(drafts).map(([g, list]) => <div key={g}><h3 className="grp">{g}</h3>{list.map((s: any) => (
          <Item key={s.id} s={s}><div className="row"><button className="btn small" disabled={busy === s.id} onClick={() => act(s.id, 'ready')}>Ready for review</button><button className="linkbtn" onClick={() => discard(s)}>Discard</button></div></Item>))}</div>)}
      </section>}

      <details className="hist-section">
        <summary>History ({history.length})</summary>
        {history.slice(0, 200).map((s: any) => (
          <div key={s.id} className="change small">
            <span className="muted">{s.appliedAt ? `${s.kind === 'variation' ? 'Registered' : 'Applied'} ${fmtTime(s.appliedAt)}` : `Discarded ${fmtTime(s.updatedAt)}`}</span> · {colName(s)} · {langName(s.language)} · {s.kind === 'replace' ? <>{s.baseText} → <b>{s.proposedText}</b></> : <b>{s.proposedText}</b>} <span className="rowid">{s.sourceId}</span>
          </div>
        ))}
      </details>
      {!drafts.length && !ready.length && !approved.length && !todo.length && <p className="small muted">Nothing open. Edit copy in the <Link href="/">workspace</Link>.</p>}
    </div>
  );
}
