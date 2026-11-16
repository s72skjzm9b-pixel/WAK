'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, useStudio, fmtTime } from '@/components/client';
import { AdPreview } from '@/components/AdPreview';
import { PLACEMENTS, placementsFor, type PlacementKey } from '@/lib/typography';
import type { Combo } from '@/lib/combos';
import { collectionCombos, feedbackFor, shownText, translationApprovalFlag, translationNeedsReview, FORMAT_LABEL, type Row, type WCollection, type WUse, type FeedbackRow, type CommentRow } from '@/lib/workspace';
import { readinessFor } from '@/lib/readiness';

const ALL_FORMATS = ['search', 'pmax', 'demand_gen'] as const;
const PAGE = 4;

export function PreviewPanel({ v, col, rows, edits, uses, candidates, selected, onClearSelected, langName, previewLangs, reload }: {
  v: any; col: WCollection; rows: Row[]; edits: Record<string, string>; uses: WUse[]; candidates: Set<string>;
  selected: Row | null; onClearSelected: () => void; langName: (c: string) => string; previewLangs: string[]; reload: () => void;
}) {
  const [lang, setLang] = useState(previewLangs[0] ?? 'EN');
  useEffect(() => { if (!previewLangs.includes(lang)) setLang(previewLangs[0] ?? 'EN'); }, [previewLangs.join(','), col.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const mapped = col.formats[lang] ?? [];
  const statusOf = (f: string) => mapped.includes(f as any) ? 'Currently mapped' : (col.intendedFormats.includes(f as any) || uses.some((u) => u.collection === col.key && u.format === f)) ? 'Intended' : 'Preview only';
  const formats = useMemo(() => [...ALL_FORMATS].sort((a, b) => ['Currently mapped', 'Intended', 'Preview only'].indexOf(statusOf(a)) - ['Currently mapped', 'Intended', 'Preview only'].indexOf(statusOf(b))), [col.key, lang, uses.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [format, setFormat] = useState<string>(formats[0]);
  useEffect(() => { setFormat(formats[0]); setPage(0); }, [col.key, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const [placement, setPlacement] = useState<PlacementKey>('search-desktop');
  useEffect(() => { if (!placementsFor(format).includes(placement)) setPlacement(placementsFor(format)[0]); setPage(0); }, [format]); // eslint-disable-line react-hooks/exhaustive-deps
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [selected?.sourceId]);

  const pv = useMemo(() => collectionCombos(col, rows, lang, format as any, edits, uses, candidates), [col, rows, lang, format, edits, uses, candidates]);
  const shown = pv.combos.filter((c) => !selected || c.slots.some((s) => s.sourceId === selected.sourceId));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice((page % pages) * PAGE, (page % pages) * PAGE + PAGE);

  // Readiness for the selected language, every format at a glance.
  const lines = rows.filter((r) => r.mappedHere || uses.some((u) => u.sourceId === r.sourceId && u.collection === col.key) || (col.isLocal && r.isNew)).map((r) => ({
    sourceId: r.sourceId, field: r.assetType, text: shownText(r, lang, edits), translationApprovalNeeded: translationApprovalFlag(r, lang), needsReview: translationNeedsReview(r, lang, edits),
  }));
  const readiness = ALL_FORMATS.map((f) => readinessFor(f, lines, { destinationConfirmed: col.destinationConfirmed || !!col.details.finalUrl, cta: col.details.cta, workbookGaps: col.workbookGaps }));
  const selText = selected ? shownText(selected, lang, edits) || shownText(selected, 'EN', edits) : '';
  const fmtLabel = (f: string) => `${FORMAT_LABEL[f]}${f === 'demand_gen' ? ' (approximate)' : ''}`;

  if (col.isIdeas) return <div className="preview-inner"><h2 className="ph">Ad examples</h2><p className="muted small">Ideas aren’t Google Ads fields yet, so there are no ad examples. Use “Use in collection…” to give an idea a real field and place.</p></div>;
  return (
    <div className="preview-inner">
      <div className="phead">
        <h2 className="ph">Ad examples</h2>
        {previewLangs.length > 1 && <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Preview language">{previewLangs.map((l) => <option key={l} value={l}>{langName(l)}</option>)}</select>}
      </div>
      <div className="fmtchips" role="radiogroup" aria-label="Format">
        {formats.map((f) => (
          <button key={f} role="radio" aria-checked={format === f} className="fmtchip" onClick={() => setFormat(f)}>
            <b>{FORMAT_LABEL[f]}</b><span>{statusOf(f)}{f === 'demand_gen' ? ' · approximate' : ''}</span>
          </button>
        ))}
      </div>
      {Readiness({ items: readiness, current: format, langName: langName(lang) })}
      {format && <div className="row" style={{ gap: 6, margin: '8px 0' }}>
        <div className="seg small" role="group" aria-label="Device">{placementsFor(format).map((p) => <button key={p} aria-pressed={placement === p} onClick={() => setPlacement(p)}>{PLACEMENTS[p].device === 'mobile' ? 'Mobile' : 'Desktop'}</button>)}</div>
        {selected && <button className="chip" aria-pressed onClick={onClearSelected} aria-label="Show all combinations">Combinations with “{selText.length > 34 ? selText.slice(0, 33) + '…' : selText}” ×</button>}
      </div>}
      <details className="pnote">
        <summary>About these examples</summary>
        <p>Illustrative, text-only: Google assembles real ads itself and may show other combinations. {PLACEMENTS[placement].basis}</p>
        {format === 'demand_gen' && <p>Demand Gen is shown with an approximate layout and approximate limits.</p>}
        <p>{statusOf(format) === 'Currently mapped' ? `Based on the Sheet’s ${FORMAT_LABEL[format]} groups: ${pv.basedOn.map((g) => `${g.campaign} / ${g.group}`).join('; ')}.` : `${statusOf(format)}: exploring ${FORMAT_LABEL[format]} with this collection’s copy. This creates no campaign and changes no mapping.`}</p>
        <p>“Works” and “Needs work” are editorial notes on how lines read together — not a performance prediction, and Google can’t be told to avoid a combination.</p>
      </details>
      {pv.candidateIds.size > 0 && <p className="small candnote">Includes candidate copy that has no intended use yet (labelled “Candidate preview”).</p>}
      {slice.length === 0 && <p className="muted small">{selected ? 'This line isn’t in any example for this format and language.' : 'Not enough copy in this language for an example yet.'}</p>}
      <div className="pcards">
        {slice.map((c, i) => <ExampleCard key={c.key + '|' + c.slots.map((s) => s.text).join('|')} n={(page % pages) * PAGE + i + 1} combo={c} placement={placement} v={v} reload={reload} businessName={v.businessName} candidates={pv.candidateIds} />)}
      </div>
      {shown.length > PAGE && (
        <div className="row small" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => setPage(page + 1)}>Next examples</button>
          <span className="muted">{(page % pages) + 1} of {pages} · a representative set where every line appears early</span>
        </div>
      )}
    </div>
  );

  function Readiness({ items, current, langName: ln }: { items: ReturnType<typeof readinessFor>[]; current: string; langName: string }) {
    return (
      <details className="readiness" open>
        <summary>Readiness · {ln}</summary>
        <ul>
          {items.map((r) => (
            <li key={r.format} className={r.format === current ? 'cur' : ''}>
              <b>{r.ready ? `Ready for ${r.label}` : `${r.label}: not ready`}</b>{r.approximate && <span className="muted"> (approximate)</span>}
              {r.missing.length > 0 && <span> · Missing {r.missing.join(', ')}</span>}
              {r.over > 0 && <span className="bad"> · {r.over} over the limit</span>}
              {r.overWarnings > 0 && <span> · {r.overWarnings} may be too long</span>}
              {r.translationApproval > 0 && <span> · {r.translationApproval} translation{r.translationApproval > 1 ? 's' : ''} awaiting approval</span>}
              {r.review > 0 && <span> · {r.review} to check against English</span>}
              {r.workbookNotes.map((n) => <span key={n}> · {n}</span>)}
              {r.format === current && r.destinationMissing && <span> · Destination unconfirmed</span>}
              {r.format === current && r.ctaMissing && <span> · Call to action not chosen</span>}
            </li>
          ))}
        </ul>
      </details>
    );
  }
}

function ExampleCard({ n, combo, placement, v, reload, businessName, candidates }: { n: number; combo: Combo; placement: PlacementKey; v: any; reload: () => void; businessName: string; candidates: Set<string> }) {
  const { toast, ensureName, ask } = useStudio();
  const f = feedbackFor(combo, v.feedback as FeedbackRow[], v.comments as CommentRow[]);
  const [open, setOpen] = useState<null | 'needs' | 'comment'>(null);
  const [lines, setLines] = useState<string[]>([]); // "slot|sourceId"; empty = whole combination
  const [text, setText] = useState('');
  const suggested = combo.slots.some((s) => s.state === 'proposed' || s.state === 'editing');
  const candidate = combo.slots.some((s) => candidates.has(s.sourceId));
  const comboBody = { key: combo.key, campaign: combo.campaign, group: combo.group, format: combo.format, language: combo.language, slots: combo.slots.map((s) => ({ slot: s.slot, sourceId: s.sourceId, text: s.text, state: s.state })) };
  const verdict = async (vd: 'works' | 'needs_changes', scope?: any) => {
    if (!(await ensureName())) return;
    try { await api('/api/feedback', { body: { combo: comboBody, verdict: vd, scope } }); reload(); } catch (e) { toast((e as Error).message); }
  };
  const clickNeeds = async () => {
    if (f.active?.verdict === 'needs_changes') { await verdict('needs_changes', f.active.scope); setOpen(null); return; } // clears
    setLines([]); setText(''); setOpen('needs');
  };
  const saveNeeds = async () => {
    const scope = lines.length ? { kind: 'lines', lines: lines.map((l) => { const [slot, sourceId] = l.split('|'); return { slot, sourceId }; }) } : { kind: 'combination' };
    if (!(await ensureName())) return;
    try {
      if (f.active?.verdict !== 'needs_changes' || JSON.stringify(f.active?.scope) !== JSON.stringify(scope)) await api('/api/feedback', { body: { combo: comboBody, verdict: 'needs_changes', scope } });
      if (text.trim()) await api('/api/comments', { body: { combo: comboBody, text } });
      setOpen(null); reload();
    } catch (e) { toast((e as Error).message); }
  };
  const saveComment = async () => {
    if (!(await ensureName())) return;
    try { await api('/api/comments', { body: { combo: comboBody, text } }); setText(''); setOpen(null); reload(); } catch (e) { toast((e as Error).message); }
  };
  const editComment = async (c: CommentRow) => {
    const r = await ask({ title: 'Edit comment', input: { label: 'Comment', initial: c.text, multiline: true, required: true }, actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'ok', primary: true }] });
    if (r.value === 'ok') { await api(`/api/comments/${c.id}`, { method: 'PATCH', body: { text: r.text } }); reload(); }
  };
  const delComment = async (c: CommentRow) => {
    const r = await ask({ title: 'Delete this comment?', body: `“${c.text}”`, actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete', value: 'ok', danger: true }] });
    if (r.value === 'ok') { await api(`/api/comments/${c.id}`, { method: 'DELETE' }); reload(); }
  };
  const label = `example ${n}`;
  const scopeText = f.active?.scope?.kind === 'lines' ? `: ${f.active.scope.lines!.map((l: any) => `“${combo.slots.find((s) => s.sourceId === l.sourceId && s.slot === l.slot)?.text ?? ''}”`).join(', ')}` : '';
  return (
    <div className={`excard ${suggested ? 'suggested' : ''}`} aria-label={`Ad ${label}`}>
      {(suggested || candidate) && <div className="exlabel">{candidate ? 'Candidate preview' : 'With suggested wording'}</div>}
      <AdPreview combo={combo} placement={placement} businessName={businessName} />
      <div className="exfb">
        <button className="fbbtn" aria-pressed={f.active?.verdict === 'works'} aria-label={`Works — ${label}`} onClick={() => verdict('works')}>Works</button>
        <button className="fbbtn" aria-pressed={f.active?.verdict === 'needs_changes'} aria-label={`Needs work — ${label}`} aria-expanded={open === 'needs'} onClick={clickNeeds}>Needs work</button>
        <button className="linkbtn" aria-expanded={open === 'comment'} aria-label={`Comment — ${label}`} onClick={() => { setText(''); setOpen(open === 'comment' ? null : 'comment'); }}>Comment</button>
        {f.active && <span className="small muted">{f.active.verdict === 'works' ? 'Works' : `Needs work${scopeText}`} · {f.active.reviewer} · {fmtTime(f.active.createdAt)}</span>}
      </div>
      {open === 'needs' && (
        <div className="fbform">
          <p className="small"><b>What needs work?</b></p>
          <label className="check"><input type="checkbox" checked={!lines.length} onChange={() => setLines([])} /> The whole combination</label>
          {combo.slots.map((s) => {
            const k = `${s.slot}|${s.sourceId}`;
            return <label key={k} className="check"><input type="checkbox" checked={lines.includes(k)} onChange={(e) => setLines(e.target.checked ? [...lines, k] : lines.filter((x) => x !== k))} /> {s.slot.startsWith('H') ? 'Headline' : 'Description'}: “{s.text}”</label>;
          })}
          <textarea rows={2} placeholder="Optional comment" value={text} onChange={(e) => setText(e.target.value)} aria-label={`Comment for ${label}`} />
          <div className="row"><button className="btn small primary" onClick={saveNeeds}>Save</button><button className="btn small" onClick={() => setOpen(null)}>Cancel</button></div>
        </div>
      )}
      {open === 'comment' && (
        <div className="fbform">
          <textarea rows={2} placeholder="Comment" value={text} onChange={(e) => setText(e.target.value)} aria-label={`Comment for ${label}`} />
          <div className="row"><button className="btn small" disabled={!text.trim()} onClick={saveComment}>Save comment</button><button className="btn small" onClick={() => setOpen(null)}>Cancel</button></div>
        </div>
      )}
      {f.comments.map((c) => (
        <div key={c.id} className="cmt">
          <span>“{c.text}”</span> <span className="muted">— {c.author}{c.editedAt ? ' (edited)' : ''}</span>
          <span className="cmtact">
            <button className="linkbtn" onClick={() => editComment(c)}>Edit</button>
            <button className="linkbtn" onClick={async () => { await api(`/api/comments/${c.id}`, { method: 'PATCH', body: { resolved: true } }); reload(); }}>Resolve</button>
            <button className="linkbtn" onClick={() => delComment(c)}>Delete</button>
          </span>
        </div>
      ))}
      {(f.history.length + f.earlier.length + f.resolvedComments.length + f.earlierComments.length) > 0 && (
        <details className="small muted hist">
          <summary>History{f.earlier.length + f.earlierComments.length ? ' · earlier feedback on different wording' : ''}</summary>
          {f.earlier.map((x) => <div key={x.id}>Earlier wording — {x.verdict === 'works' ? 'Works' : 'Needs work'} · {x.reviewer} · {fmtTime(x.createdAt)}<br /><i>{x.combo.slots.map((s) => s.text).join(' | ')}</i></div>)}
          {f.earlierComments.map((c) => <div key={c.id}>Earlier wording — “{c.text}” · {c.author}</div>)}
          {f.history.map((x) => <div key={x.id}>{x.verdict === 'works' ? 'Works' : 'Needs work'} · {x.reviewer} · {fmtTime(x.createdAt)}{x.resolvedAt ? ' · resolved' : ' · changed later'}</div>)}
          {f.resolvedComments.map((c) => <div key={c.id}>Resolved: “{c.text}” · {c.author} <button className="linkbtn" onClick={async () => { await api(`/api/comments/${c.id}`, { method: 'PATCH', body: { resolved: false } }); reload(); }}>Reopen</button></div>)}
        </details>
      )}
    </div>
  );
}
