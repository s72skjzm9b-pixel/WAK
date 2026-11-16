'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, safeGet, safeSet, Diff, fmtTime } from '@/components/client';
import { AdPreview } from '@/components/AdPreview';
import { limitFor, charCount } from '@/lib/limits';
import { PLACEMENTS, placementsFor, type PlacementKey } from '@/lib/typography';
import type { Combo } from '@/lib/combos';
import {
  rowsFor, shownText, translationNeedsReview, isEdited, collectionCombos, feedbackFor, needsWorkKeys,
  LANG_LABEL, FORMAT_LABEL, type Row, type WCollection, type WLang, type FeedbackRow,
} from '@/lib/workspace';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const ALL_LANGS: WLang[] = ['EN', 'DK', 'DE'];
const SHOW_FILTERS = ['New', 'Edited', 'Needs translation review', 'Needs work', 'Returned'] as const;
const TYPE_ORDER = ['Headline', 'Long headline', 'Description', 'Short introduction'];
const plural = (t: string) => (/y$/.test(t) ? t : `${t}s`);

export function Workspace() {
  const { version, toast } = useStudio();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [colKey, setColKey] = useState<string>('');
  const [langs, setLangs] = useState<WLang[]>(['EN', 'DK', 'DE']);
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [fIntents, setFIntents] = useState<string[]>([]);
  const [fShow, setFShow] = useState<string[]>([]);
  const [fTypes, setFTypes] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>('idle');
  const [temps, setTemps] = useState<{ key: string; assetType: string; sourceId: string | null }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pane, setPane] = useState<'copy' | 'preview'>('copy');
  const [openOriginal, setOpenOriginal] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try { const d = await api('/api/workspace'); setData(d); setErr(null); return d; } catch (e) { setErr((e as Error).message); return null; }
  }, []);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => {
    const k = safeGet('ws.collection'); if (k) setColKey(k);
    const l = safeGet('ws.langs'); if (l) setLangs(JSON.parse(l));
  }, []);
  useEffect(() => { if (colKey) safeSet('ws.collection', colKey); }, [colKey]);
  useEffect(() => { safeSet('ws.langs', JSON.stringify(langs)); }, [langs]);

  // Drop local edits once the saved suggestion (or the Sheet) holds the same text.
  useEffect(() => {
    if (!data) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(prev)) {
        const [id, lang] = k.split('|');
        if (pending.current.has(k)) continue;
        const sug = data.suggestions.find((s: any) => s.sourceId === id && s.language === lang && ['draft', 'submitted', 'changes_requested', 'approved'].includes(s.state));
        const item = data.items.find((i: any) => i.sourceId === id);
        const saved = sug?.proposedText ?? item?.versions[lang]?.text ?? '';
        if (saved === prev[k]) delete next[k];
      }
      return next;
    });
  }, [data]);

  // ---------------- autosave
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const chains = useRef<Record<string, Promise<unknown>>>({});
  const pending = useRef(new Set<string>());
  const tempIds = useRef<Record<string, string>>({}); // temp row key → NEW-### once saved
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => load(), 400); };

  const queueSave = (row: Row, lang: WLang, text: string, collection: string) => {
    const k = `${row.sourceId}|${lang}`;
    setEdits((e) => ({ ...e, [k]: text }));
    setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
    setSave('saving');
    pending.current.add(k);
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => {
      const rowKey = row.key;
      chains.current[rowKey] = (chains.current[rowKey] ?? Promise.resolve()).then(async () => {
        const realId = row.isNew ? (tempIds.current[row.key] ?? (row.sourceId.startsWith('tmp-') ? null : row.sourceId)) : row.sourceId;
        try {
          const res = await api('/api/suggestions', { method: 'PUT', body: row.isNew
            ? { isNew: true, sourceId: realId, collection, assetType: row.assetType, language: lang, text }
            : { sourceId: row.sourceId, language: lang, text } });
          if (row.isNew && !realId && res.revision?.sourceId) {
            tempIds.current[row.key] = res.revision.sourceId;
            setTemps((t) => t.map((x) => (x.key === row.key ? { ...x, sourceId: res.revision.sourceId } : x)));
            setEdits((e) => { const n = { ...e }; for (const l of ALL_LANGS) { const tk = `${row.sourceId}|${l}`; if (tk in n) { n[`${res.revision.sourceId}|${l}`] = n[tk]; delete n[tk]; } } return n; });
          }
          pending.current.delete(k);
          setSave(pending.current.size ? 'saving' : 'saved');
          scheduleReload();
        } catch (e) {
          pending.current.delete(k);
          setErrors((x) => ({ ...x, [k]: (e as Error).message }));
          setSave('error');
        }
      });
    }, 650);
  };

  // ---------------- derived
  const cols: WCollection[] = data?.collections ?? [];
  const col = cols.find((c) => c.key === colKey) ?? cols[0];
  const itemsById = useMemo(() => new Map<string, any>((data?.items ?? []).map((i: any) => [i.sourceId, i])), [data]);
  const englishById = useMemo(() => new Map<string, string>((data?.items ?? []).map((i: any) => [i.sourceId, i.versions.EN.text])), [data]);
  const baseRows = useMemo(() => (col && data ? rowsFor(col, data.items, data.suggestions) : []), [col, data]);
  const rows: Row[] = useMemo(() => {
    const extra: Row[] = temps.filter((t) => !t.sourceId || !baseRows.some((r) => r.sourceId === t.sourceId)).map((t) => ({
      key: t.key, sourceId: t.sourceId ?? t.key, isNew: true, assetType: t.assetType, linkedHeadline: null,
      sheet: { EN: '', DK: '', DE: '' }, sheetStatus: { EN: '', DK: '', DE: '' }, suggestion: {},
    }));
    const keyed = baseRows.map((r) => { const t = temps.find((x) => x.sourceId === r.sourceId); return t ? { ...r, key: t.key } : r; });
    return [...keyed, ...extra];
  }, [baseRows, temps]);

  // Preview settings
  const previewLangs = col?.languages ?? [];
  const [pLang, setPLang] = useState<WLang>('EN');
  const [pFormat, setPFormat] = useState<string>('');
  const [placement, setPlacement] = useState<PlacementKey>('search-desktop');
  const [n, setN] = useState(4);
  useEffect(() => {
    if (!col) return;
    const l = previewLangs.includes(pLang) ? pLang : previewLangs.find((x) => langs.includes(x)) ?? previewLangs[0] ?? 'EN';
    setPLang(l);
    const fmts = col.formats[l] ?? [];
    const f = fmts.includes(pFormat as any) ? pFormat : fmts[0] ?? '';
    setPFormat(f);
    if (f && !placementsFor(f).includes(placement)) setPlacement(placementsFor(f)[0]);
    setN(4);
  }, [col?.key, pLang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pFormat && !placementsFor(pFormat).includes(placement)) setPlacement(placementsFor(pFormat)[0]); }, [pFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => (col && pFormat ? collectionCombos(col, rows, pLang, pFormat as any, edits, englishById) : { combos: [] as Combo[], basedOn: [], notes: [] as string[] }), [col, rows, pLang, pFormat, edits, englishById]);
  const feedback: FeedbackRow[] = data?.feedback ?? [];
  const needsWork = useMemo(() => needsWorkKeys(preview.combos, feedback), [preview.combos, feedback]);

  if (err) return <div className="notice bad">Could not load the copy: {err}. <Link href="/settings">Settings</Link></div>;
  if (!data || !col) return <p className="muted">Loading copy from the workbook…</p>;

  // Row status
  const statusOf = (r: Row) => {
    const s: { label: string; tone: string; title?: string }[] = [];
    if (r.isNew) s.push({ label: 'New', tone: 'proposed' });
    else if (ALL_LANGS.some((l) => isEdited(r, l, edits))) s.push({ label: 'Edited', tone: 'proposed' });
    if (ALL_LANGS.some((l) => translationNeedsReview(r, l, edits))) s.push({ label: 'Needs translation review', tone: 'warn' });
    if (needsWork.has(r.sourceId)) s.push({ label: 'Needs work', tone: 'warn' });
    const sugs = Object.values(r.suggestion);
    const ret = sugs.find((x) => x?.state === 'changes_requested');
    if (ret) s.push({ label: 'Returned', tone: 'warn', title: ret.returnedNote || 'Returned for editing' });
    if (sugs.some((x) => x?.syncState === 'conflict')) s.push({ label: 'Sheet changed', tone: 'bad', title: 'The Sheet changed after this suggestion. Resolve it in Changes.' });
    else if (sugs.some((x) => x?.state === 'approved' && x.kind === 'replace')) s.push({ label: 'Accepted · Sheet update pending', tone: 'accent' });
    return s;
  };

  const ql = q.trim().toLowerCase();
  const matches = (r: Row) => !ql || r.sourceId.toLowerCase().includes(ql) || ALL_LANGS.some((l) => shownText(r, l, edits).toLowerCase().includes(ql));
  const visibleRows = rows.filter((r) => matches(r)
    && (!fTypes.length || fTypes.includes(r.assetType))
    && (!fShow.length || statusOf(r).some((s) => fShow.includes(s.label === 'Accepted · Sheet update pending' ? 'Edited' : s.label))));
  const types = [...new Set(rows.map((r) => r.assetType))].sort((a, b) => (TYPE_ORDER.indexOf(a) + 99) % 99 - (TYPE_ORDER.indexOf(b) + 99) % 99);
  const intents = [...new Set(cols.map((c) => c.intent))];
  const activeFilters = [...fIntents.map((x) => ({ k: 'i', x })), ...fShow.map((x) => ({ k: 's', x })), ...fTypes.map((x) => ({ k: 't', x }))];
  const clearAll = () => { setFIntents([]); setFShow([]); setFTypes([]); };
  const countFor = (c: WCollection) => {
    const rs = rowsFor(c, data.items, data.suggestions);
    return ql ? rs.filter(matches).length : rs.length;
  };
  const addCopy = (assetType: string) => {
    const key = `tmp-${Date.now()}`;
    setTemps((t) => [...t, { key, assetType, sourceId: null }]);
    setTimeout(() => (document.querySelector(`[data-row="${key}"] textarea`) as HTMLTextAreaElement | null)?.focus(), 50);
  };
  const shown = preview.combos.filter((c) => !selected || c.slots.some((s) => s.sourceId === selected));
  const alsoIn = (id: string) => cols.filter((c) => c.key !== col.key && c.sourceIds.includes(id)).map((c) => c.name);

  return (
    <div className={`ws pane-${pane}`}>
      {/* Collections */}
      <nav className="ws-nav" aria-label="Collections">
        <select className="ws-nav-select" value={col.key} onChange={(e) => { setColKey(e.target.value); setSelected(null); }} aria-label="Collection">
          {cols.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <ul>
          {cols.filter((c) => !fIntents.length || fIntents.includes(c.intent)).map((c) => {
            const count = countFor(c);
            const hasSug = data.suggestions.some((s: any) => ['draft', 'submitted', 'changes_requested'].includes(s.state) && (s.collection === c.key || (!s.collection && c.sourceIds.includes(s.sourceId))));
            return (
              <li key={c.key}>
                <button aria-current={c.key === col.key ? 'true' : undefined} className={ql && !count ? 'dim' : ''} onClick={() => { setColKey(c.key); setSelected(null); setTemps([]); }}>
                  <span>{c.name}</span>
                  <span className="count">{hasSug && <span className="dot" title="Has suggestions" />}{count || ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Copy */}
      <section className="ws-copy" aria-label="Copy">
        <div className="ws-head">
          <h1>{col.name}</h1>
          <p className="summary">
            <span>{col.intent}</span>
            <span>{col.audience}</span>
            {col.languages.length > 0 && <span>{col.languages.map((l) => `${LANG_LABEL[l]}${col.markets[l]?.length ? ` (${col.markets[l]!.join(', ')})` : ''}`).join(' · ')}</span>}
            <span>{col.destination}{!col.destinationConfirmed && <em className="unconf"> · unconfirmed</em>}</span>
          </p>
          {col.note && <p className="small muted" style={{ margin: 0 }}>{col.note}</p>}
        </div>

        <div className="toolbar">
          <input type="search" placeholder="Search copy" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search copy" className="search" />
          <div className="filterwrap">
            <button className="btn small" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>Filter{activeFilters.length ? ` · ${activeFilters.length}` : ''}</button>
            {filterOpen && (
              <div className="popover" role="dialog" aria-label="Filters">
                <h4>Customer intent</h4>
                <div className="chips">{intents.map((x) => <button key={x} className="chip" aria-pressed={fIntents.includes(x)} onClick={() => setFIntents(fIntents.includes(x) ? fIntents.filter((y) => y !== x) : [...fIntents, x])}>{x}</button>)}</div>
                <h4>Show only</h4>
                <div className="chips">{SHOW_FILTERS.map((x) => <button key={x} className="chip" aria-pressed={fShow.includes(x)} onClick={() => setFShow(fShow.includes(x) ? fShow.filter((y) => y !== x) : [...fShow, x])}>{x}</button>)}</div>
                <h4>Type</h4>
                <div className="chips">{[...new Set(cols.flatMap((c) => rowsFor(c, data.items, data.suggestions).map((r) => r.assetType)))].map((x) => <button key={x} className="chip" aria-pressed={fTypes.includes(x)} onClick={() => setFTypes(fTypes.includes(x) ? fTypes.filter((y) => y !== x) : [...fTypes, x])}>{x}</button>)}</div>
                <div className="row" style={{ marginTop: 10 }}><button className="btn small" onClick={clearAll}>Clear all</button><button className="btn small" onClick={() => setFilterOpen(false)}>Done</button></div>
              </div>
            )}
          </div>
          <div className="langtoggle" role="group" aria-label="Languages shown">
            {ALL_LANGS.map((l) => <button key={l} aria-pressed={langs.includes(l)} onClick={() => setLangs(langs.includes(l) ? (langs.length > 1 ? langs.filter((x) => x !== l) : langs) : ALL_LANGS.filter((x) => x === l || langs.includes(x)))}>{l === 'DK' ? 'DA' : l}</button>)}
          </div>
          <span className={`savestate ${save}`} aria-live="polite">{save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved' : save === 'error' ? 'Could not save' : ''}</span>
        </div>
        {activeFilters.length > 0 && (
          <div className="chips" style={{ marginBottom: 8 }}>
            {activeFilters.map((a) => <button key={a.k + a.x} className="chip" aria-pressed onClick={() => (a.k === 'i' ? setFIntents(fIntents.filter((y) => y !== a.x)) : a.k === 's' ? setFShow(fShow.filter((y) => y !== a.x)) : setFTypes(fTypes.filter((y) => y !== a.x)))}>{a.x} ×</button>)}
            <button className="linkbtn" onClick={clearAll}>Clear filters</button>
          </div>
        )}

        <div className="mobile-switch seg" role="group" aria-label="View">
          <button aria-pressed={pane === 'copy'} onClick={() => setPane('copy')}>Copy</button>
          <button aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>Preview</button>
        </div>

        {(types.length ? types : ['Headline', 'Description']).map((t) => {
          const list = visibleRows.filter((r) => r.assetType === t);
          return (
            <div key={t} className="typeblock">
              <div className="typehead">
                <h2>{plural(t)}</h2>
                <span className="muted small">{list.length}</span>
                <span style={{ flex: 1 }} />
                {(t === 'Headline' || t === 'Description') && <button className="btn small" onClick={() => addCopy(t)}>Add {t.toLowerCase()}</button>}
              </div>
              <div className="langhead" style={{ gridTemplateColumns: `repeat(${langs.length}, minmax(0, 1fr))` }}>{langs.map((l) => <span key={l}>{LANG_LABEL[l]}</span>)}</div>
              {list.length === 0 && <p className="muted small" style={{ padding: '8px 0' }}>{ql ? 'No matches.' : `No ${t.toLowerCase()}s yet.`}</p>}
              {list.map((r) => {
                const st = statusOf(r);
                const item = itemsById.get(r.sourceId);
                return (
                  <div key={r.key} data-row={r.key} className={`copyrow ${selected === r.sourceId ? 'selected' : ''}`} onFocusCapture={() => !r.sourceId.startsWith('tmp-') && setSelected(r.sourceId)}>
                    <div className="rowmeta">
                      {st.map((s) => <span key={s.label} className={`qtag ${s.tone}`} title={s.title}>{s.label}</span>)}
                      {r.linkedHeadline && <span className="muted small">Pairs with “{r.linkedHeadline}”</span>}
                      <span style={{ flex: 1 }} />
                      <span className="rowid" title={alsoIn(r.sourceId).length ? `Shared copy — also in ${alsoIn(r.sourceId).join(', ')}. Editing changes it everywhere.` : ''}>{r.sourceId.startsWith('tmp-') ? 'new' : r.sourceId}{alsoIn(r.sourceId).length ? ' · shared' : ''}</span>
                    </div>
                    <div className="fields" style={{ gridTemplateColumns: `repeat(${langs.length}, minmax(0, 1fr))` }}>
                      {langs.map((l) => {
                        const k = `${r.sourceId}|${l}`;
                        const text = shownText(r, l, edits);
                        const fmts = r.isNew ? (col.formats[l] ?? []) : (item?.usages ?? []).filter((u: any) => u.language === l).map((u: any) => u.format);
                        const max = Math.min(...fmts.map((f: any) => limitFor(r.assetType, f)?.max ?? Infinity));
                        const over = Number.isFinite(max) && charCount(text) > max;
                        const needsEn = r.isNew && l !== 'EN' && !(tempIds.current[r.key] ?? (r.sourceId.startsWith('tmp-') ? null : r.sourceId));
                        const edited = isEdited(r, l, edits);
                        const review = translationNeedsReview(r, l, edits);
                        return (
                          <div key={l} className="field">
                            <textarea
                              rows={1} lang={l === 'DK' ? 'da' : l === 'DE' ? 'de' : 'en'} aria-label={`${LANG_LABEL[l]} ${r.assetType.toLowerCase()} ${r.sourceId}`}
                              className={`${edited || r.isNew ? 'edited' : ''} ${review ? 'review' : ''}`}
                              value={text} disabled={needsEn} placeholder={needsEn ? 'Write the English first' : r.isNew || !r.sheet[l] ? `${LANG_LABEL[l]} — not written yet` : ''}
                              onChange={(e) => queueSave(r, l, e.target.value, col.key)}
                              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }}
                              ref={(t) => { if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }}
                            />
                            <div className="fieldfoot">
                              <span className={over ? 'over' : ''}>{charCount(text)}{Number.isFinite(max) ? `/${max}` : ''}{over ? ' — too long' : ''}</span>
                              {review && <span className="reviewnote" title={`English now: “${shownText(r, 'EN', edits)}”`}>check against English</span>}
                              {edited && <button className="linkbtn" onClick={() => setOpenOriginal({ ...openOriginal, [k]: !openOriginal[k] })}>{openOriginal[k] ? 'Hide original' : 'Original'}</button>}
                            </div>
                            {edited && openOriginal[k] && (
                              <div className="original">
                                <div><Diff a={r.sheet[l]} b={text} /></div>
                                <button className="linkbtn" onClick={() => { queueSave(r, l, r.sheet[l], col.key); setOpenOriginal({ ...openOriginal, [k]: false }); }}>Revert to “{r.sheet[l] || 'empty'}”</button>
                              </div>
                            )}
                            {errors[k] && <div className="fielderr">{errors[k]}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {!rows.length && <p className="muted">No copy in this collection yet. Add a headline or description to start — it stays a suggestion in this collection.</p>}
      </section>

      {/* Preview */}
      <aside className="ws-preview" aria-label="Ad examples">
        <div className="preview-inner">
          <div className="phead">
            <h2>Ad examples</h2>
            {selected && <button className="chip" aria-pressed onClick={() => setSelected(null)}>Showing {selected} ×</button>}
          </div>
          {!col.previewable || !previewLangs.length ? (
            <p className="muted small">Text only — this collection isn’t mapped to an ad format yet, so there are no examples to show.</p>
          ) : (
            <>
              <div className="pcontrols">
                {previewLangs.length > 1 && <select value={pLang} onChange={(e) => setPLang(e.target.value as WLang)} aria-label="Preview language">{previewLangs.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</select>}
                {(col.formats[pLang] ?? []).length > 1 && <select value={pFormat} onChange={(e) => setPFormat(e.target.value)} aria-label="Format">{(col.formats[pLang] ?? []).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}</select>}
                {(col.formats[pLang] ?? []).length === 1 && <span className="small muted">{FORMAT_LABEL[pFormat]}</span>}
                {pFormat && <div className="seg small" role="group" aria-label="Placement">{placementsFor(pFormat).map((p) => <button key={p} aria-pressed={placement === p} onClick={() => setPlacement(p)}>{PLACEMENTS[p].device === 'mobile' ? 'Mobile' : 'Desktop'}</button>)}</div>}
              </div>
              <details className="pnote">
                <summary>Illustrative, text-only examples</summary>
                <p>Not live ads: Google assembles ads itself and may show combinations not listed here. {PLACEMENTS[placement].basis}</p>
                <p>“Works” and “Needs work” are editorial notes on how lines read together — not a performance prediction, and not something Google can enforce to block a combination. To keep two lines apart, change or remove one.</p>
                {pFormat === 'demand_gen' && <p>Demand Gen is shown with the Performance Max-style text layout; its limits are provisional.</p>}
                <p>Based on: {preview.basedOn.map((g) => `${g.campaign} / ${g.group}`).join('; ')}.{preview.notes.length ? ` ${preview.notes.join(' ')}` : ''}</p>
              </details>
              {shown.length === 0 && <p className="muted small">{selected ? 'This line isn’t used in this format/language.' : 'No compatible combinations in this language and format.'}</p>}
              <div className="pcards">
                {shown.slice(0, n).map((c) => <ExampleCard key={c.key + c.slots.map((s) => s.text).join('|')} combo={c} placement={placement} feedback={feedback} onSaved={load} toast={toast} />)}
              </div>
              {shown.length > n && <button className="btn small" onClick={() => setN(n + 4)}>More examples ({shown.length - n})</button>}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function ExampleCard({ combo, placement, feedback, onSaved, toast }: { combo: Combo; placement: PlacementKey; feedback: FeedbackRow[]; onSaved: () => void; toast: (m: string) => void }) {
  const { current, earlier } = feedbackFor(combo, feedback);
  const latest = [...current].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const suggested = combo.slots.some((s) => s.state === 'proposed' || s.state === 'editing');
  const send = async (verdict: 'works' | 'needs_changes' | 'comment') => {
    try {
      await api('/api/feedback', { body: { combo: { key: combo.key, campaign: combo.campaign, group: combo.group, format: combo.format, language: combo.language, slots: combo.slots.map((s) => ({ slot: s.slot, sourceId: s.sourceId, text: s.text, state: s.state })) }, verdict, reasons: [], comment } });
      setComment(''); setShowComment(false); onSaved();
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className={`excard ${suggested ? 'suggested' : ''}`}>
      {suggested && <div className="exlabel">With suggested wording</div>}
      <AdPreview combo={combo} placement={placement} />
      <div className="exfb">
        <button className="fbbtn" aria-pressed={latest?.verdict === 'works'} onClick={() => send('works')}>Works</button>
        <button className="fbbtn" aria-pressed={latest?.verdict === 'needs_changes'} onClick={() => send('needs_changes')}>Needs work</button>
        <button className="linkbtn" onClick={() => setShowComment(!showComment)}>Comment</button>
        {latest && <span className="small muted">{latest.verdict === 'works' ? 'Works' : latest.verdict === 'needs_changes' ? 'Needs work' : 'Comment'} · {fmtTime(latest.createdAt)}</span>}
      </div>
      {showComment && (
        <div className="row" style={{ marginTop: 6 }}>
          <input type="text" placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn small" disabled={!comment.trim()} onClick={() => send(latest?.verdict ?? 'comment')}>Save</button>
        </div>
      )}
      {current.filter((f) => f.comment).slice(0, 2).map((f) => <p key={f.id} className="small" style={{ margin: '4px 0 0' }}>“{f.comment}” <span className="muted">— {f.reviewer}</span></p>)}
      {earlier.length > 0 && (
        <details className="small muted" style={{ marginTop: 4 }}>
          <summary>Earlier feedback on different wording ({earlier.length})</summary>
          {earlier.map((f) => <div key={f.id} style={{ marginTop: 4 }}>{f.verdict === 'works' ? 'Works' : f.verdict === 'needs_changes' ? 'Needs work' : 'Comment'}{f.comment ? ` — “${f.comment}”` : ''} · {fmtTime(f.createdAt)}<br />on: {f.combo.slots.map((s) => s.text).join(' | ')}</div>)}
        </details>
      )}
    </div>
  );
}
