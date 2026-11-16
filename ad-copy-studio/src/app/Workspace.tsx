'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, safeGet, safeSet, Diff, fmtTime, Modal } from '@/components/client';
import { useAutosave } from '@/components/useAutosave';
import { limitFor, charCount } from '@/lib/limits';
import { rowsFor, shownText, translationNeedsReview, translationApprovalFlag, isEdited, lineNeedsWork, editKey, FORMAT_LABEL, CANONICAL, type Row, type WCollection, type WUse } from '@/lib/workspace';
import { CollectionBrief } from './ws/CollectionBrief';
import { PreviewPanel } from './ws/PreviewPanel';

const TYPE_ORDER = ['Headline', 'Long headline', 'Description'];
const ADDABLE = ['Headline', 'Long headline', 'Description'];
const SHOW = ['New', 'Edited', 'Draft', 'Ready for review', 'Needs translation review', 'Needs work', 'Returned', 'Needs intended use'];
const PRESET_LANGS = [['SV', 'Swedish', 'sv-SE'], ['NO', 'Norwegian', 'nb-NO'], ['FI', 'Finnish', 'fi-FI'], ['NL', 'Dutch', 'nl-NL'], ['FR', 'French', 'fr-FR'], ['ES', 'Spanish', 'es-ES'], ['IT', 'Italian', 'it-IT'], ['JA', 'Japanese', 'ja-JP'], ['KO', 'Korean', 'ko-KR']];
const plural = (t: string) => `${t}s`;
const stateWord: Record<string, string> = { draft: 'Draft', changes_requested: 'Returned', submitted: 'Ready for review', approved: 'Approved locally', written: 'In the Sheet' };
interface Temp { key: string; collection: string; assetType: string; linkedHeadlineId: string | null }

export function Workspace() {
  const { version, toast, ask, ensureName, name } = useStudio();
  const [v, setV] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setV(await api('/api/workspace')); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, []);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soonReload = useCallback(() => { if (reloadTimer.current) clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(load, 350); }, [load]);
  useEffect(() => { load(); }, [load, version]);
  const nameRef = useRef(name); nameRef.current = name;
  const saver = useAutosave({ onServerChange: soonReload, headers: () => ({ 'Content-Type': 'application/json', 'x-studio-client': '1', 'x-studio-name': encodeURIComponent(nameRef.current) }) });

  const [colKey, setColKey] = useState('');
  const [temps, setTemps] = useState<Temp[]>([]);
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [fIntents, setFIntents] = useState<string[]>([]);
  const [fShow, setFShow] = useState<string[]>([]);
  const [fTypes, setFTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pane, setPane] = useState<'copy' | 'preview'>('copy');
  const [langsByCol, setLangsByCol] = useState<Record<string, string[]>>({});
  const [showOther, setShowOther] = useState(false);
  const [phoneLang, setPhoneLang] = useState<string>('EN');
  const [openOriginal, setOpenOriginal] = useState<Record<string, boolean>>({});
  const [sharedChoice, setSharedChoice] = useState<Record<string, 'all'>>({});
  const [candidates, setCandidates] = useState<Set<string>>(new Set());
  const [intro, setIntro] = useState(false);
  const [modal, setModal] = useState<null | { kind: 'newcol' | 'lang' | 'idea' | 'use'; row?: Row }>(null);
  useEffect(() => {
    setColKey(safeGet('ws.collection') ?? '');
    setTemps(JSON.parse(safeGet('ws.temps.v2') ?? '[]'));
    setLangsByCol(JSON.parse(safeGet('ws.langsByCol') ?? '{}'));
    setIntro(safeGet('ws.introDismissed') !== '1');
  }, []);
  const saveTemps = (t: Temp[]) => { setTemps(t); safeSet('ws.temps.v2', JSON.stringify(t)); };
  useEffect(() => { if (colKey) safeSet('ws.collection', colKey); }, [colKey]);

  const cols: WCollection[] = v?.collections ?? [];
  const col = cols.find((c) => c.key === colKey) ?? cols[0];
  const uses: WUse[] = v?.intendedUses ?? [];
  const allLangs: { code: string; name: string; canonical: boolean }[] = v?.languages ?? [];
  const langName = useCallback((c: string) => allLangs.find((l) => l.code === c)?.name ?? c, [allLangs]);
  const baseRows = useMemo(() => (col && v ? rowsFor(col, v) : []), [col, v]);
  // New lines saved under a temporary key keep that key on screen so the field never loses focus.
  const rows: Row[] = useMemo(() => {
    if (!col) return [];
    const keyed = baseRows.map((r) => { const t = temps.find((x) => saver.tempIds[x.key] === r.sourceId); return t ? { ...r, key: t.key } : r; });
    const extra = temps.filter((t) => t.collection === col.key && !baseRows.some((r) => r.sourceId === saver.tempIds[t.key])).map((t): Row => ({
      key: t.key, sourceId: saver.tempIds[t.key] ?? t.key, isNew: true, assetType: t.assetType, linkedHeadlineId: t.linkedHeadlineId, sheet: {}, sheetStatus: {}, suggestion: {}, home: col.key, mappedHere: false, usedIn: [], separatedFrom: null,
    }));
    return [...keyed, ...extra];
  }, [baseRows, temps, saver.tempIds, col]);
  // Forget temp rows once they exist on the server and nothing is pending.
  useEffect(() => {
    const keep = temps.filter((t) => !(saver.tempIds[t.key] && baseRows.some((r) => r.sourceId === saver.tempIds[t.key]) && !saver.pendingFor(t.key).length) || t.collection !== col?.key);
    if (keep.length !== temps.length) saveTemps(keep);
  }, [baseRows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="notice bad">Could not load the copy: {err}. <Link href="/settings">Settings</Link></div>;
  if (!v || !col) return <p className="muted">Loading copy…</p>;

  const edits = saver.edits;
  const relevant = [...new Set([...(col.studioLanguages ?? []), ...col.languages])].filter((l) => allLangs.some((x) => x.code === l));
  const shownLangs = (langsByCol[col.key] ?? relevant.filter((l) => (col.studioLanguages ?? []).includes(l) || col.languages.includes(l))).filter((l) => allLangs.some((x) => x.code === l));
  const visible = shownLangs.length ? shownLangs : ['EN'];
  const others = allLangs.map((l) => l.code).filter((l) => !relevant.includes(l));
  const setVisible = (ls: string[]) => { const next = { ...langsByCol, [col.key]: ls }; setLangsByCol(next); safeSet('ws.langsByCol', JSON.stringify(next)); };
  const selectedRow = rows.find((r) => r.sourceId === selected) ?? null;

  const stateOf = (r: Row) => Object.values(r.suggestion).filter(Boolean).map((s) => s!.state);
  const tagsOf = (r: Row) => {
    const t: { label: string; tone: string }[] = [];
    if (r.isNew) t.push({ label: r.separatedFrom ? 'Separate version' : 'New', tone: 'proposed' });
    else if (visible.some((l) => isEdited(r, l, edits)) || Object.keys(r.suggestion).length) t.push({ label: 'Edited', tone: 'proposed' });
    const st = stateOf(r);
    for (const s of ['changes_requested', 'submitted', 'approved']) if (st.includes(s)) t.push({ label: stateWord[s], tone: s === 'changes_requested' ? 'warn' : 'accent' });
    if (st.includes('draft')) t.push({ label: 'Draft', tone: 'neutral' });
    if (visible.some((l) => translationNeedsReview(r, l, edits))) t.push({ label: 'Needs translation review', tone: 'warn' });
    if (visible.some((l) => lineNeedsWork(r.sourceId, l, shownText(r, l, edits), v.feedback))) t.push({ label: 'Needs work', tone: 'warn' });
    if (Object.values(r.suggestion).some((s) => s?.syncState === 'conflict')) t.push({ label: 'Sheet changed', tone: 'bad' });
    if (r.isNew && !uses.some((u) => u.sourceId === r.sourceId) && !col.isIdeas) t.push({ label: candidates.has(r.sourceId) ? 'Candidate preview' : 'No intended use yet', tone: 'neutral' });
    if (Object.values(r.suggestion).some((s) => s?.needsIntendedUse)) t.push({ label: 'Needs intended use', tone: 'warn' });
    return t;
  };

  const ql = q.trim().toLowerCase();
  const matches = (r: Row) => !ql || [...visible, 'EN'].some((l) => shownText(r, l, edits).toLowerCase().includes(ql));
  const visibleRows = rows.filter((r) => matches(r) && (!fTypes.length || fTypes.includes(r.assetType)) && (!fShow.length || tagsOf(r).some((t) => fShow.includes(t.label))));
  const types = [...new Set([...TYPE_ORDER.filter((t) => t !== 'Long headline' || rows.some((r) => r.assetType === t) || (col.intendedFormats as string[]).includes('pmax') || Object.values(col.formats).flat().includes('pmax' as any) || (col.intendedFormats as string[]).includes('demand_gen')), ...rows.map((r) => r.assetType)])];
  const allTypes = [...new Set(cols.flatMap((c) => c.isIdeas ? [] : TYPE_ORDER))];
  const activeFilters = [...fIntents.map((x) => ({ k: 'i', x })), ...fShow.map((x) => ({ k: 's', x })), ...fTypes.map((x) => ({ k: 't', x }))];
  const clearAll = () => { setFIntents([]); setFShow([]); setFTypes([]); };

  const switchCollection = async (key: string) => {
    if (key === col.key) return;
    saver.flush();
    const unfinished = temps.filter((t) => t.collection === col.key && !saver.tempIds[t.key] && !saver.pendingFor(t.key).some((e) => e.text.trim()));
    if (unfinished.length) {
      const r = await ask({ title: `Unfinished new ${unfinished[0].assetType.toLowerCase()} in ${col.name}`, body: 'It stays in this collection — it never moves to another one.', actions: [{ label: 'Stay and finish', value: 'stay', primary: true }, { label: 'Discard it', value: 'discard', danger: true }, { label: 'Keep it here for later', value: 'keep' }] });
      if (r.value === 'stay' || r.value === 'cancel') return;
      if (r.value === 'discard') saveTemps(temps.filter((t) => !unfinished.includes(t)));
    }
    setColKey(key); setSelected(null); setShowOther(false);
  };

  const addCopy = (assetType: string, linkedHeadlineId: string | null = null) => {
    const key = `tmp-${Date.now().toString(36)}`;
    saveTemps([...temps, { key, collection: col.key, assetType, linkedHeadlineId }]);
    setTimeout(() => document.querySelector<HTMLTextAreaElement>(`[data-row="${key}"] textarea`)?.focus(), 60);
  };
  const addPairedDescription = async () => {
    const heads = rows.filter((r) => r.assetType === 'Headline');
    const r = await ask({ title: 'Add a description to which pair?', body: 'In this collection each headline keeps its own descriptions.', actions: [{ label: 'Cancel', value: 'cancel' }, ...heads.slice(0, 8).map((h) => ({ label: `“${shownText(h, 'EN', edits)}”`, value: h.sourceId }))] });
    if (r.value !== 'cancel') addCopy('Description', r.value);
  };

  const onType = (r: Row, lang: string, text: string) => {
    saver.edit({ rowKey: r.key, sourceId: r.isNew ? (saver.tempIds[r.key] ?? (r.key.startsWith('tmp-') ? null : r.sourceId)) : r.sourceId, isNew: r.isNew, collection: col.key, assetType: r.assetType, linkedHeadlineId: r.linkedHeadlineId, lang, text });
  };
  // Shared wording: ask once before the first change.
  const guardShared = async (r: Row, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (r.isNew || r.usedIn.length < 2 || sharedChoice[r.sourceId] || Object.keys(r.suggestion).length) return;
    if (e.key.length !== 1 && e.key !== 'Backspace' && e.key !== 'Delete') return;
    e.preventDefault();
    const where = r.usedIn.map((u) => u.name);
    const res = await ask({
      title: 'This wording is shared',
      body: <>Used in {where.slice(0, -1).join(', ')}{where.length > 1 ? ' and ' : ''}{where[where.length - 1]}. Changing it here changes it everywhere it is used.</>,
      actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Make a separate version here', value: 'separate' }, { label: 'Update shared wording everywhere', value: 'all', primary: true }],
    });
    if (res.value === 'all') { setSharedChoice({ ...sharedChoice, [r.sourceId]: 'all' }); toast('You can now edit the shared wording.'); }
    if (res.value === 'separate') {
      try { const rev = await api('/api/separate', { body: { sourceId: r.sourceId, collection: col.key } }); await load(); setSelected(rev.sourceId); toast('Separate version created here. It starts without translations.'); }
      catch (err) { toast((err as Error).message); }
    }
  };

  const markReady = async (r: Row) => {
    if (!(await ensureName())) return;
    saver.flush(r.key);
    await new Promise((res) => setTimeout(res, 300));
    const drafts = Object.values(r.suggestion).filter((s) => s && ['draft', 'changes_requested'].includes(s.state));
    if (saver.pendingFor(r.key).length) { toast('Still saving — try again in a moment.'); return; }
    try { for (const s of drafts) await api(`/api/revisions/${s!.id}/ready`, { body: {} }); toast('Ready for review. It now appears in Changes.'); load(); } catch (e) { toast((e as Error).message); }
  };
  const backToDraft = async (r: Row) => {
    for (const s of Object.values(r.suggestion).filter((x) => x?.state === 'submitted')) await api(`/api/revisions/${s!.id}/back-to-draft`, { body: {} });
    load();
  };

  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches;
  const fieldLangs = phone ? [visible.includes(phoneLang) ? phoneLang : visible[0]] : visible;
  const tempUnsaved = (r: Row) => r.isNew && r.key.startsWith('tmp-') && !saver.tempIds[r.key];

  return (
    <div className={`ws pane-${pane}`}>
      <nav className="ws-nav" aria-label="Collections">
        <select className="ws-nav-select" value={col.key} onChange={(e) => switchCollection(e.target.value)} aria-label="Collection">{cols.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
        <ul>
          {cols.filter((c) => !fIntents.length || fIntents.includes(c.intent)).map((c) => {
            const n = c.key === col.key ? rows.filter(matches).length : rowsFor(c, v).filter(matches).length;
            const dot = v.suggestions.some((s: any) => ['draft', 'submitted', 'changes_requested'].includes(s.state) && (s.collection === c.key || (!s.collection && c.sourceIds.includes(s.sourceId))));
            return <li key={c.key}><button aria-current={c.key === col.key ? 'true' : undefined} className={ql && !n ? 'dim' : ''} onClick={() => switchCollection(c.key)}><span>{c.name}</span><span className="count">{dot && <span className="dot" aria-label="has drafts" />}{n || ''}</span></button></li>;
          })}
        </ul>
        <button className="linkbtn newcol" onClick={() => setModal({ kind: 'newcol' })}>+ New collection</button>
      </nav>

      <section className="ws-copy" aria-label="Copy">
        {intro && <FirstUse mode={v.mode} onClose={() => { setIntro(false); safeSet('ws.introDismissed', '1'); }} />}
        <CollectionBrief col={col} langName={langName} allLangs={allLangs} reload={load} />
        <div className="toolbar">
          <input type="search" placeholder="Search copy" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search copy" className="search" />
          <div className="filterwrap">
            <button className="btn small" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>Filter{activeFilters.length ? ` · ${activeFilters.length}` : ''}</button>
            {filterOpen && (
              <div className="popover" role="dialog" aria-label="Filters">
                <h4>Customer intent</h4>
                <div className="chips">{[...new Set(cols.map((c) => c.intent))].map((x) => <button key={x} className="chip" aria-pressed={fIntents.includes(x)} onClick={() => setFIntents(fIntents.includes(x) ? fIntents.filter((y) => y !== x) : [...fIntents, x])}>{x}</button>)}</div>
                <h4>Show only</h4>
                <div className="chips">{SHOW.map((x) => <button key={x} className="chip" aria-pressed={fShow.includes(x)} onClick={() => setFShow(fShow.includes(x) ? fShow.filter((y) => y !== x) : [...fShow, x])}>{x}</button>)}</div>
                <h4>Field</h4>
                <div className="chips">{allTypes.map((x) => <button key={x} className="chip" aria-pressed={fTypes.includes(x)} onClick={() => setFTypes(fTypes.includes(x) ? fTypes.filter((y) => y !== x) : [...fTypes, x])}>{x}</button>)}</div>
                <div className="row" style={{ marginTop: 10 }}><button className="btn small" onClick={clearAll}>Clear all</button><button className="btn small" onClick={() => setFilterOpen(false)}>Done</button></div>
              </div>
            )}
          </div>
          <div className="langtoggle desk" role="group" aria-label="Languages shown">
            {[...relevant, ...(showOther ? others : [])].map((l) => <button key={l} aria-pressed={visible.includes(l)} onClick={() => setVisible(visible.includes(l) ? (visible.length > 1 ? visible.filter((x) => x !== l) : visible) : [...visible, l])}>{l === 'DK' ? 'DA' : l}</button>)}
            {others.length > 0 && <button className="linkbtn" onClick={() => setShowOther(!showOther)} aria-expanded={showOther}>{showOther ? 'Fewer languages' : 'Other language versions'}</button>}
            <button className="linkbtn" onClick={() => setModal({ kind: 'lang' })}>+ Language</button>
          </div>
          <select className="langselect phone" value={fieldLangs[0]} onChange={(e) => { setPhoneLang(e.target.value); if (!visible.includes(e.target.value)) setVisible([...visible, e.target.value]); }} aria-label="Language">{[...relevant, ...others].map((l) => <option key={l} value={l}>{langName(l)}</option>)}</select>
          <SaveState summary={saver.summary} onRetry={saver.retry} />
        </div>
        {showOther && <p className="small muted">Other language versions are shown for reference. {col.languages.length ? `This collection is used in ${col.languages.map(langName).join(', ')}.` : 'This collection is not mapped to any language yet.'} Languages without a column in the Sheet stay local only.</p>}
        {activeFilters.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{activeFilters.map((a) => <button key={a.k + a.x} className="chip" aria-pressed onClick={() => (a.k === 'i' ? setFIntents(fIntents.filter((y) => y !== a.x)) : a.k === 's' ? setFShow(fShow.filter((y) => y !== a.x)) : setFTypes(fTypes.filter((y) => y !== a.x)))}>{a.x} ×</button>)}<button className="linkbtn" onClick={clearAll}>Clear filters</button></div>}
        <div className="mobile-switch seg" role="group" aria-label="View"><button aria-pressed={pane === 'copy'} onClick={() => setPane('copy')}>Copy</button><button aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>Preview</button></div>

        {(col.isIdeas ? [...new Set(rows.map((r) => r.assetType))] : types).map((t) => {
          const list = visibleRows.filter((r) => r.assetType === t);
          return (
            <div key={t} className="typeblock">
              <div className="typehead">
                <h2>{plural(t)}</h2><span className="muted small">{list.length}</span><span style={{ flex: 1 }} />
                {!col.isIdeas && ADDABLE.includes(t) && (col.pairing && t === 'Description'
                  ? <button className="btn small" onClick={addPairedDescription}>Add description to a pair</button>
                  : <button className="btn small" onClick={() => addCopy(t)}>Add {t.toLowerCase()}</button>)}
              </div>
              <div className="langhead" style={{ gridTemplateColumns: `repeat(${fieldLangs.length}, minmax(0, 1fr))` }}>{fieldLangs.map((l) => <span key={l}>{langName(l)}{!allLangs.find((x) => x.code === l)?.canonical ? ' · local only' : ''}</span>)}</div>
              {list.length === 0 && <p className="muted small" style={{ padding: '8px 0' }}>{ql ? 'No matches.' : t === 'Long headline' ? 'No long headlines yet — Performance Max needs at least one.' : `No ${t.toLowerCase()}s yet.`}</p>}
              {list.map((r) => {
                const tags = tagsOf(r);
                const isSel = selected === r.sourceId;
                const pairHead = r.linkedHeadlineId ? rows.find((x) => x.sourceId === r.linkedHeadlineId) : null;
                return (
                  <div key={r.key} data-row={r.key} className={`copyrow ${isSel ? 'selected' : ''}`} onFocusCapture={() => !tempUnsaved(r) && setSelected(r.sourceId)} onClick={() => !tempUnsaved(r) && setSelected(r.sourceId)}>
                    <div className="rowmeta">
                      {tags.map((x) => <span key={x.label} className={`qtag ${x.tone}`}>{x.label}</span>)}
                      {pairHead && <span className="muted small">Pairs with “{shownText(pairHead, 'EN', edits)}”</span>}
                      <span style={{ flex: 1 }} />
                      {r.usedIn.length > 1 && <span className="shared">Shared · {r.usedIn.length}</span>}
                    </div>
                    <div className="fields" style={{ gridTemplateColumns: `repeat(${fieldLangs.length}, minmax(0, 1fr))` }}>
                      {fieldLangs.map((l) => <div key={l} style={{ display: 'contents' }}>{Field({ r, l })}</div>)}
                    </div>
                    {isSel && RowDetails({ r })}
                  </div>
                );
              })}
              {col.pairing && t === 'Headline' && <p className="small muted">New headlines start their own pair. Add descriptions to a pair with the button under Descriptions.</p>}
            </div>
          );
        })}
        {!rows.length && <p className="muted">{col.isIdeas ? 'No ideas.' : 'No copy here yet. Add a headline, long headline or description — it stays a draft in this collection.'}</p>}
      </section>

      <aside className="ws-preview" aria-label="Ad examples">
        <PreviewPanel v={v} col={col} rows={rows.filter((r) => !tempUnsaved(r))} edits={edits} uses={uses} candidates={candidates} selected={selectedRow} onClearSelected={() => setSelected(null)}
          langName={langName} previewLangs={[...new Set([...visible.filter((l) => col.languages.includes(l) || col.isLocal || !col.languages.length), ...col.languages])].filter((l) => allLangs.some((x) => x.code === l))} reload={load} />
      </aside>

      {modal?.kind === 'newcol' && <NewCollection onClose={() => setModal(null)} onCreated={async (key) => { setModal(null); await load(); setColKey(key); }} />}
      {modal?.kind === 'lang' && <AddLanguage existing={allLangs.map((l) => l.code)} onClose={() => setModal(null)} onAdded={async (code) => { setModal(null); await load(); setVisible([...visible, code]); }} />}
      {modal?.kind === 'idea' && modal.row && <UseIdea row={modal.row} cols={cols.filter((c) => !c.isIdeas)} text={shownText(modal.row, 'EN', edits)} onClose={() => setModal(null)} onDone={async (key) => { setModal(null); await load(); if (key) setColKey(key); }} />}
      {modal?.kind === 'use' && modal.row && <EditUse row={modal.row} cols={cols.filter((c) => !c.isIdeas)} uses={uses.filter((u) => u.sourceId === modal.row!.sourceId)} onClose={() => setModal(null)} onChanged={load} />}
    </div>
  );

  function Field({ r, l }: { r: Row; l: string }) {
    const k = editKey(r.sourceId, l);
    const text = shownText(r, l, edits);
    const item = v.items.find((i: any) => i.sourceId === r.sourceId);
    const fmts: string[] = r.isNew ? [...new Set([...(col.formats[l] ?? []), ...(col.intendedFormats as string[]), ...uses.filter((u) => u.sourceId === r.sourceId && u.format).map((u) => u.format!)])] : [...new Set([...(item?.usages ?? []).filter((u: any) => u.language === l).map((u: any) => u.format), ...uses.filter((u) => u.sourceId === r.sourceId && u.format).map((u) => u.format!)])];
    const limits = fmts.map((f) => limitFor(r.assetType, f as any)).filter(Boolean) as { max: number; verified: boolean }[];
    const hard = limits.filter((x) => x.verified).map((x) => x.max);
    const max = Math.min(...(hard.length ? hard : limits.map((x) => x.max)), Infinity);
    const over = Number.isFinite(max) && charCount(text) > max;
    const needsEn = r.isNew && l !== 'EN' && !(saver.tempIds[r.key] ?? (r.key.startsWith('tmp-') ? null : r.sourceId));
    const edited = isEdited(r, l, edits);
    const review = translationNeedsReview(r, l, edits);
    const approvalFlag = translationApprovalFlag(r, l);
    const sug = r.suggestion[l];
    const errId = `err-${r.key}-${l}`, cntId = `cnt-${r.key}-${l}`;
    const error = saver.errors[k];
    return (
      <div className="field">
        <textarea
          rows={1} lang={l === 'DK' ? 'da' : l.toLowerCase()} aria-label={`${langName(l)} ${r.assetType.toLowerCase()}${r.isNew ? ' (new)' : `: ${r.sheet.EN ?? ''}`}`}
          aria-describedby={`${cntId}${error ? ` ${errId}` : ''}`} aria-invalid={over || !!error || undefined}
          className={`${edited || r.isNew ? 'edited' : ''} ${review ? 'review' : ''}`}
          value={text} disabled={needsEn || sug?.state === 'approved'} placeholder={needsEn ? 'Write the English first' : (r.isNew || !(r.sheet[l] ?? '')) ? `${langName(l)} — not written yet` : ''}
          onKeyDown={(e) => guardShared(r, e)}
          onChange={(e) => onType(r, l, e.target.value)}
          onBlur={() => saver.flush(r.key, l)}
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }}
          ref={(t) => { if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }}
        />
        <div className="fieldfoot">
          <span id={cntId} className={over ? 'over' : ''}>{charCount(text)}{Number.isFinite(max) ? ` of ${max}` : ''}{over ? ' — too long' : ''}</span>
          {sug && sug.state !== 'draft' && <span>{stateWord[sug.state] ?? ''}</span>}
          {review && <span className="reviewnote">Check against the English</span>}
          {!review && approvalFlag && <span>Translation not yet approved</span>}
          {!allLangs.find((x) => x.code === l)?.canonical && text && <span>Local only</span>}
          {edited && <button className="linkbtn" onClick={() => setOpenOriginal({ ...openOriginal, [k]: !openOriginal[k] })} aria-expanded={!!openOriginal[k]}>{openOriginal[k] ? 'Hide original' : 'Original'}</button>}
        </div>
        {edited && openOriginal[k] && <div className="original"><div><Diff a={r.sheet[l] ?? ''} b={text} /></div><button className="linkbtn" onClick={() => { onType(r, l, r.sheet[l] ?? ''); setOpenOriginal({ ...openOriginal, [k]: false }); }}>Revert to “{r.sheet[l] || 'empty'}”</button></div>}
        {error && <div className="fielderr" id={errId} role="alert">Could not save: {error} <button className="linkbtn" onClick={saver.retry}>Retry</button></div>}
      </div>
    );
  }

  function RowDetails({ r }: { r: Row }) {
    const drafts = Object.values(r.suggestion).filter((s) => s && ['draft', 'changes_requested'].includes(s.state));
    const ready = Object.values(r.suggestion).filter((s) => s?.state === 'submitted');
    const returned = Object.values(r.suggestion).find((s) => s?.state === 'changes_requested');
    const hasUseHere = uses.some((u) => u.sourceId === r.sourceId && u.collection === col.key);
    const where = r.usedIn.map((u) => u.name);
    const item = v.items.find((i: any) => i.sourceId === r.sourceId);
    const prov = Object.values(r.suggestion).find((s) => s?.provenance)?.provenance;
    return (
      <div className="rowdetails" onClick={(e) => e.stopPropagation()}>
        <div className="row small">
          <span>{where.length ? <>Used in {where.slice(0, -1).join(', ')}{where.length > 1 ? ' and ' : ''}{where[where.length - 1]}</> : r.isNew ? `Kept in ${col.name} · not intended for any ad yet` : 'Not used in any ad group yet'}</span>
          {!col.isIdeas && <button className="linkbtn" onClick={() => setModal({ kind: 'use', row: r })}>Edit use</button>}
          {col.isIdeas && <button className="btn small" onClick={() => setModal({ kind: 'idea', row: r })}>Use in collection…</button>}
          {r.isNew && !hasUseHere && !col.isIdeas && <button className="linkbtn" onClick={() => { const n = new Set(candidates); if (n.has(r.sourceId)) n.delete(r.sourceId); else n.add(r.sourceId); setCandidates(n); }}>{candidates.has(r.sourceId) ? 'Stop candidate preview' : 'Try in preview'}</button>}
          <span style={{ flex: 1 }} />
          {drafts.length > 0 && <button className="btn small primary" onClick={() => markReady(r)}>Ready for review</button>}
          {ready.length > 0 && <button className="linkbtn" onClick={() => backToDraft(r)}>Back to draft</button>}
        </div>
        {returned?.returnedNote && <p className="small warntext">Returned for editing: “{returned.returnedNote}”</p>}
        <details className="small muted">
          <summary>Details</summary>
          <div>ID {r.sourceId}{r.separatedFrom ? ` · separate version of ${r.separatedFrom}` : ''}{item ? ` · ${item.theme}` : ''}{r.linkedHeadlineId ? ` · paired with ${r.linkedHeadlineId}` : ''}</div>
          {item?.usageRule && <div>Rule in the Sheet: {item.usageRule}</div>}
          {prov && <div>Based on {prov.mode === 'google' ? 'the live Sheet' : prov.mode === 'sandbox' ? 'the practice copy' : 'the snapshot'} read {fmtTime(prov.at)}{prov.mode !== 'google' ? ' — a live comparison is required before any write' : ''}</div>}
          {item && <div>Sheet status: {['EN', 'DK', 'DE'].map((l) => `${l} — ${item.versions[l].status || '—'}`).join(' · ')}</div>}
        </details>
      </div>
    );
  }
}

function SaveState({ summary, onRetry }: { summary: string; onRetry: () => void }) {
  return (
    <span className={`savestate ${summary}`} aria-live="polite">
      {summary === 'saving' ? 'Saving draft…' : summary === 'saved' ? 'Draft saved locally' : summary === 'recovered' ? 'Recovered draft — saving…' : summary === 'failed' ? <>Could not save <button className="linkbtn" onClick={onRetry}>Retry</button></> : ''}
    </span>
  );
}

function FirstUse({ mode, onClose }: { mode: string; onClose: () => void }) {
  return (
    <div className="intro" role="note">
      <b>How this works</b>
      <ul>
        <li>Type directly in any wording. It is saved as a <b>draft on this computer</b> — the Google Sheet is not changed.</li>
        <li>When a draft is finished, choose <b>Ready for review</b>. Only then can it be approved in Changes.</li>
        <li>You are using the <b>{mode === 'google' ? 'live Sheet' : mode === 'sandbox' ? 'practice copy' : 'snapshot'}</b>. Snapshot = read-only copy of the Sheet; Practice = safe local copy to try approvals; Live = the real Sheet. See Settings.</li>
        <li>Your name (asked once) is saved with feedback and reviews. Nothing is ever published to Google Ads from here.</li>
      </ul>
      <button className="btn small" onClick={onClose}>Got it</button>
    </div>
  );
}

function NewCollection({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const { toast } = useStudio();
  const [f, setF] = useState({ name: '', description: '', imageNote: '', formats: ['search'] as string[], languages: ['EN'] });
  const create = async () => { try { const r = await api('/api/collections', { body: f }); onCreated(r.key); } catch (e) { toast((e as Error).message); } };
  return (
    <Modal title="New collection" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim()} onClick={create}>Create</button></>}>
      <p className="small muted">A place to organise and review copy. It stays in the studio — no campaigns or mappings are created.</p>
      <label className="field"><span>Name</span><input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span>Description (optional)</span><input type="text" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className="field"><span>Image direction (optional)</span><input type="text" value={f.imageNote} onChange={(e) => setF({ ...f, imageNote: e.target.value })} /></label>
      <fieldset className="field"><legend>Preview formats</legend><div className="chips">{['search', 'pmax', 'demand_gen'].map((x) => <button key={x} type="button" className="chip" aria-pressed={f.formats.includes(x)} onClick={() => setF({ ...f, formats: f.formats.includes(x) ? f.formats.filter((y) => y !== x) : [...f.formats, x] })}>{FORMAT_LABEL[x]}</button>)}</div></fieldset>
      <fieldset className="field"><legend>Languages</legend><div className="chips">{[['EN', 'English'], ['DK', 'Danish'], ['DE', 'German']].map(([c, n]) => <button key={c} type="button" className="chip" aria-pressed={f.languages.includes(c)} onClick={() => setF({ ...f, languages: f.languages.includes(c) ? (f.languages.length > 1 ? f.languages.filter((y) => y !== c) : f.languages) : [...f.languages, c] })}>{n}</button>)}</div></fieldset>
    </Modal>
  );
}

function AddLanguage({ existing, onClose, onAdded }: { existing: string[]; onClose: () => void; onAdded: (code: string) => void }) {
  const { toast } = useStudio();
  const [pick, setPick] = useState('');
  const [custom, setCustom] = useState({ code: '', name: '', locale: '' });
  const choice = PRESET_LANGS.find((p) => p[0] === pick);
  const body = choice ? { code: choice[0], name: choice[1], locale: choice[2] } : custom;
  const add = async () => { try { const r = await api('/api/languages', { body }); onAdded(r.code); } catch (e) { toast((e as Error).message); } };
  return (
    <Modal title="Add a language" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!body.code || !body.name} onClick={add}>Add</button></>}>
      <p className="small muted">The new language starts empty — nothing is copied or translated automatically. The master Sheet has columns only for English, Danish and German, so this language stays <b>local only</b> for now.</p>
      <label className="field"><span>Language</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{PRESET_LANGS.filter((p) => !existing.includes(p[0])).map((p) => <option key={p[0]} value={p[0]}>{p[1]} ({p[2]})</option>)}<option value="custom">Other…</option></select>
      </label>
      {pick === 'custom' && <div className="row"><label className="field"><span>Name</span><input type="text" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /></label><label className="field"><span>Code</span><input type="text" value={custom.code} placeholder="e.g. PT" onChange={(e) => setCustom({ ...custom, code: e.target.value })} /></label><label className="field"><span>Locale</span><input type="text" value={custom.locale} placeholder="e.g. pt-PT" onChange={(e) => setCustom({ ...custom, locale: e.target.value })} /></label></div>}
    </Modal>
  );
}

function UseIdea({ row, cols, text, onClose, onDone }: { row: Row; cols: WCollection[]; text: string; onClose: () => void; onDone: (key: string | null) => void }) {
  const { toast } = useStudio();
  const [f, setF] = useState({ collection: cols[0]?.key ?? '', field: 'Description', mode: 'copy' as 'copy' | 'link', format: '' });
  const go = async () => { try { await api('/api/ideas/use', { body: { sourceId: row.sourceId, ...f, format: f.format || null } }); toast(f.mode === 'copy' ? 'Copied into the collection as a new draft.' : 'Linked: the idea is now intended for that collection.'); onDone(f.collection); } catch (e) { toast((e as Error).message); } };
  return (
    <Modal title="Use in collection…" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>Use it</button></>}>
      <p>“{text}”</p>
      <label className="field"><span>Collection</span><select value={f.collection} onChange={(e) => setF({ ...f, collection: e.target.value })}>{cols.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label>
      <label className="field"><span>Google field</span><select value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}>{ADDABLE.map((x) => <option key={x}>{x}</option>)}</select></label>
      <fieldset className="field"><legend>How</legend>
        <label className="check"><input type="radio" checked={f.mode === 'copy'} onChange={() => setF({ ...f, mode: 'copy' })} /> Independent copy — a new line you can edit freely (empty translations)</label>
        <label className="check"><input type="radio" checked={f.mode === 'link'} onChange={() => setF({ ...f, mode: 'link' })} /> Keep linked to the idea — edits to the idea apply here too</label>
      </fieldset>
      <label className="field"><span>Intended format (optional)</span><select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}><option value="">Not decided</option>{['search', 'pmax', 'demand_gen'].map((x) => <option key={x} value={x}>{FORMAT_LABEL[x]}</option>)}</select></label>
    </Modal>
  );
}

function EditUse({ row, cols, uses, onClose, onChanged }: { row: Row; cols: WCollection[]; uses: WUse[]; onClose: () => void; onChanged: () => void }) {
  const { toast } = useStudio();
  const [add, setAdd] = useState({ collection: '', format: '' });
  const mapped = row.usedIn.filter((u) => u.kind === 'mapped');
  const addUse = async () => { try { await api('/api/uses', { body: { sourceId: row.sourceId, collection: add.collection, field: row.assetType, format: add.format || null } }); setAdd({ collection: '', format: '' }); onChanged(); } catch (e) { toast((e as Error).message); } };
  const name = (k: string) => cols.find((c) => c.key === k)?.name ?? k;
  return (
    <Modal title="Where this copy is used" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <h4>Mapped from the Sheet (read-only)</h4>
      {mapped.length ? <ul className="small">{mapped.map((m) => <li key={m.key}>{m.name}</li>)}</ul> : <p className="small muted">None.</p>}
      <h4>Studio use (local intent — creates no campaign or mapping)</h4>
      {uses.length ? <ul className="small">{uses.map((u) => <li key={u.id}>{name(u.collection)}{u.format ? ` · ${FORMAT_LABEL[u.format]}` : ''} <button className="linkbtn" onClick={async () => { await api(`/api/uses/${u.id}`, { method: 'DELETE' }); onChanged(); }}>Remove</button></li>)}</ul> : <p className="small muted">None yet.</p>}
      <div className="row">
        <select value={add.collection} onChange={(e) => setAdd({ ...add, collection: e.target.value })} aria-label="Collection"><option value="">Add to collection…</option>{cols.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
        <select value={add.format} onChange={(e) => setAdd({ ...add, format: e.target.value })} aria-label="Format"><option value="">Any format</option>{['search', 'pmax', 'demand_gen'].map((x) => <option key={x} value={x}>{FORMAT_LABEL[x]}</option>)}</select>
        <button className="btn small" disabled={!add.collection} onClick={addUse}>Add</button>
      </div>
      <p className="small muted">Generic brand wording can be shared deliberately. Location-specific wording should stay separate.</p>
    </Modal>
  );
}

void CANONICAL;
