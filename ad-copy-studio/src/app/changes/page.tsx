'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, Diff, fmtTime } from '@/components/client';
import { LANG_LABEL, rowsFor, translationNeedsReview, type WCollection } from '@/lib/workspace';
import { limitFor, charCount } from '@/lib/limits';

export default function ChangesPage() {
  const { version, toast, bump } = useStudio();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setD(await api('/api/workspace')), []);
  useEffect(() => { load(); }, [load, version]);
  if (!d) return <p className="muted">Loading…</p>;

  const cols: WCollection[] = d.collections;
  const colNames = (s: any) => s.collection ? [cols.find((c) => c.key === s.collection)?.name ?? 'Not yet assigned'] : cols.filter((c) => c.sourceIds.includes(s.sourceId)).map((c) => c.name);
  const reviewFlag = (s: any) => {
    if (s.language === 'EN') return false;
    const c = cols.find((x) => x.key === s.collection) ?? cols.find((x) => x.sourceIds.includes(s.sourceId));
    if (!c) return false;
    const row = rowsFor(c, d.items, d.suggestions).find((r) => r.sourceId === s.sourceId);
    return row ? translationNeedsReview(row, s.language, {}) : false;
  };
  const tooLong = (s: any) => {
    const item = d.items.find((i: any) => i.sourceId === s.sourceId);
    const type = s.meta?.assetType ?? item?.assetType ?? '';
    const c = cols.find((x) => x.key === s.collection);
    const fmts: string[] = item ? item.usages.filter((u: any) => u.language === s.language).map((u: any) => u.format) : (c?.formats[s.language as 'EN'] ?? []);
    const max = Math.min(...fmts.map((f) => limitFor(type, f as any)?.max ?? Infinity));
    return Number.isFinite(max) && charCount(s.proposedText) > max ? `${charCount(s.proposedText)}/${max} characters — too long to accept. Shorten it in the workspace.` : null;
  };
  const englishChangeAffects = (s: any) => s.language === 'EN' && s.kind === 'replace' && ['DK', 'DE'].some((l) => d.items.find((i: any) => i.sourceId === s.sourceId)?.versions[l]?.text);

  const act = async (id: string, action: string, body: any = {}) => {
    setBusy(id);
    try {
      const r = await api(`/api/revisions/${id}/${action}`, { body });
      if (r && typeof r.ok === 'boolean') toast(r.ok ? r.message : `Not done: ${r.message}`);
      await load(); bump();
    } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  };

  const sugg = d.suggestions.filter((s: any) => ['draft', 'submitted', 'changes_requested'].includes(s.state));
  const pending = d.suggestions.filter((s: any) => s.state === 'approved' && s.kind === 'replace');
  const accepted = d.suggestions.filter((s: any) => s.state === 'written' || (s.state === 'approved' && s.kind !== 'replace'));
  const ackFor = (id: string) => d.acks.find((a: any) => a.revisionId === id);

  const Item = ({ s, children }: { s: any; children?: React.ReactNode }) => (
    <div className="change">
      <div className="changemeta">
        <b>{colNames(s).join(', ') || '—'}</b><span>{LANG_LABEL[s.language as 'EN']}</span>
        <span>{s.kind === 'variation' ? 'New copy' : s.kind === 'retire' ? 'Remove' : 'Edit'}</span>
        <span className="muted">{fmtTime(s.updatedAt)}</span><span className="rowid">{s.sourceId}</span>
      </div>
      {s.kind === 'variation' ? <p className="changetext"><ins className="plain">{s.proposedText}</ins></p>
        : s.kind === 'retire' ? <p className="changetext"><s>{s.baseText}</s></p>
        : <div className="oldnew"><div><span className="lbl">Was</span>{s.baseText || <i className="muted">empty</i>}</div><div><span className="lbl">Now</span>{s.proposedText}</div><div className="small muted"><Diff a={s.baseText} b={s.proposedText} /></div></div>}
      {tooLong(s) && <p className="small" style={{ color: 'var(--bad)', margin: '4px 0' }}>{tooLong(s)}</p>}
      {reviewFlag(s) && <p className="small warntext">Translation needs review against the current English.</p>}
      {englishChangeAffects(s) && <p className="small muted">The Danish and German versions will need review once this English is accepted.</p>}
      {s.state === 'changes_requested' && <p className="small warntext">Returned for editing{s.returnedNote ? `: “${s.returnedNote}”` : ''}</p>}
      {children}
    </div>
  );

  return (
    <div className="changes">
      <h1>Changes</h1>
      <p className="muted">Suggestions stay on this computer until accepted. Accepting writes the exact wording to the Sheet (when connected) and checks it was saved.</p>
      {d.mode !== 'google' && <p className="small notice">{d.mode === 'sandbox' ? 'Practice copy: accepting writes to the local practice Sheet, not the real one.' : 'Snapshot mode is read-only: accepted changes wait until the live Sheet is connected in Settings.'}</p>}

      {sugg.length > 0 && <section><h2>Suggestions <span className="muted small">{sugg.length}</span></h2>
        {sugg.map((s: any) => (
          <Item key={s.id} s={s}>
            <div className="row">
              <button className="btn small primary" disabled={busy === s.id || !!tooLong(s)} onClick={() => act(s.id, 'accept')}>Accept</button>
              {s.state !== 'changes_requested' && <button className="btn small" disabled={busy === s.id} onClick={() => { const note = prompt('Return for editing — optional note for the copywriter:') ; if (note !== null) act(s.id, 'return', { comment: note }); }}>Return for editing</button>}
              <button className="linkbtn" onClick={() => { if (confirm('Discard this suggestion? The Sheet wording stays as it is.')) act(s.id, 'revert'); }}>Discard</button>
            </div>
          </Item>
        ))}
      </section>}

      {pending.length > 0 && <section><h2>Accepted — waiting for the Sheet</h2>
        {pending.map((s: any) => (
          <Item key={s.id} s={s}>
            {s.syncState === 'conflict' ? (
              <div className="conflict">
                <p><b>The Sheet changed after this suggestion was made.</b> Nothing was overwritten.</p>
                <div className="oldnew"><div><span className="lbl">Sheet now</span>{d.items.find((i: any) => i.sourceId === s.sourceId)?.versions[s.language]?.text}</div><div><span className="lbl">Your wording</span>{s.proposedText}</div></div>
                <div className="row"><button className="btn small" onClick={() => act(s.id, 'keep-current')}>Keep my wording (review again)</button><button className="linkbtn" onClick={() => act(s.id, 'revert')}>Discard mine, keep the Sheet</button></div>
              </div>
            ) : (
              <div className="row"><span className="small muted">{s.syncState === 'failed' ? `Couldn’t update the Sheet: ${s.syncDetail}` : 'Sheet not updated yet (read-only or not connected).'}</span><button className="btn small" disabled={busy === s.id || !d.canWrite} onClick={() => act(s.id, 'write')}>Update Sheet now</button></div>
            )}
          </Item>
        ))}
      </section>}

      <section>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>For Anabelle: accepted changes</h2>
          {accepted.length > 0 && <div className="row">
            <button className="btn small" onClick={async () => { const r = await api('/api/changes/export'); try { await navigator.clipboard.writeText(r.text); toast('Copied.'); } catch { toast('Clipboard not available.'); } }}>Copy list</button>
            <a className="btn small" href="/api/changes/export?format=csv">Download CSV</a>
          </div>}
        </div>
        <p className="small muted">Old → new wording to apply in Google Ads. This list is not a Google Ads import file.</p>
        {accepted.length === 0 ? <p className="muted">No accepted changes yet.</p> : accepted.map((s: any) => {
          const ack = ackFor(s.id);
          return (
            <Item key={s.id} s={s}>
              <div className="row small">
                {s.state === 'written' ? <span className="qtag ok">In the Sheet</span> : <span className="qtag warn" title="New lines are kept in the studio in this version; add them to the Sheet by hand (see README).">Kept in the studio</span>}
                {s.state === 'written' && (ack?.referenceState === 'advanced' ? <span className="muted">Marked as applied {fmtTime(ack.at)}</span>
                  : <button className="linkbtn" title="Records that you applied this in Google Ads and clears it from “Updates for Anabelle” in the Sheet. The studio cannot check Google Ads." onClick={() => { if (confirm('Mark as applied in Google Ads?\n\nThis records your confirmation and clears the row from “Updates for Anabelle”. The studio cannot check Google Ads itself.')) act(s.id, 'mark-applied'); }}>Mark as applied</button>)}
              </div>
            </Item>
          );
        })}
      </section>
      {!sugg.length && !pending.length && <p className="small muted">No open suggestions. Edit copy in the <Link href="/">workspace</Link>.</p>}
    </div>
  );
}
