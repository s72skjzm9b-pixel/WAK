'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useStudio, Tag, StateTag, SyncTag, Diff, fmtTime } from '@/components/client';
import { PreviewCard, TypographyNote } from '@/components/AdPreview';
import { generateCombos, type Combo, type GroupContext } from '@/lib/combos';
import { FORMAT_SPECS, charCount, validateText, limitFor } from '@/lib/limits';
import { PLACEMENTS, placementsFor, type PlacementKey } from '@/lib/typography';

type Lang = 'EN' | 'DK' | 'DE';
type Mode = 'replace' | 'variation' | 'retire';
const LANG_NAME: Record<Lang, string> = { EN: 'English', DK: 'Danish', DE: 'German' };
const REASONS = ['Clarity', 'Tone', 'Length / character limit', 'Repetition', 'Translation quality', 'Factual accuracy', 'Seasonal update', 'Context / intent fit'];

export function WriteView() {
  const { version, toast, bump } = useStudio();
  const [lib, setLib] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ intent: '', market: '', lang: 'EN' as Lang, theme: '', assetType: '', q: '', alternatives: false });
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => { try { setLib(await api('/api/library')); setErr(null); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { load(); }, [load, version]);

  const items: any[] = lib?.items ?? [];
  const themes = useMemo(() => [...new Set(items.map((i) => i.theme))], [items]);
  const types = useMemo(() => [...new Set(items.map((i) => i.assetType))], [items]);
  const markets = useMemo(() => [...new Set((lib?.campaigns ?? []).map((c: any) => c.market))] as string[], [lib]);
  const shown = items.filter((i) =>
    (!f.intent || i.intents.includes(f.intent)) && (!f.market || i.usages.some((u: any) => u.market === f.market)) &&
    (!f.theme || i.theme === f.theme) && (!f.assetType || i.assetType === f.assetType) &&
    (!f.q || `${i.sourceId} ${i.langs.EN.text} ${i.langs.DK.text} ${i.langs.DE.text}`.toLowerCase().includes(f.q.toLowerCase())));
  const seasonalGap = f.intent === 'christmas' || f.intent === 'advent';
  const alternatives = f.alternatives ? (lib?.campaigns ?? []).flatMap((c: any) => c.alternatives.filter((a: any) => (!f.market || c.market === f.market) && (f.lang === c.language))) : [];
  const item = items.find((i) => i.sourceId === sel) ?? null;

  if (err) return <div className="notice bad">Could not load the copy library: {err} <Link href="/connection">Check the connection</Link>.</div>;
  if (!lib) return <p className="muted">Loading the copy library from the workbook…</p>;

  return (
    <div className="split">
      <aside className="panel">
        <h2>Copy library</h2>
        <p className="small muted">Wording from the Sheet ({lib.origin === 'snapshot' ? 'snapshot' : lib.origin === 'sandbox' ? 'sandbox copy' : 'live'}, read {fmtTime(lib.readAt)}). Being in the Sheet does not mean approved or live.</p>
        <div className="filters">
          <label className="field wide"><span>Customer intent</span>
            <select value={f.intent} onChange={(e) => setF({ ...f, intent: e.target.value })}>
              <option value="">All intents</option>
              {lib.intentGroups.map((g: any) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Market (campaign tabs)</span>
            <select value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })}><option value="">All</option>{markets.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label className="field"><span>Language</span>
            <select value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value as Lang })}>{(['EN', 'DK', 'DE'] as Lang[]).map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}</select>
          </label>
          <label className="field"><span>Copy family</span>
            <select value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })}><option value="">All</option>{themes.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field"><span>Asset type</span>
            <select value={f.assetType} onChange={(e) => setF({ ...f, assetType: e.target.value })}><option value="">All</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field wide"><span>Search wording or ID</span><input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
          <label className="check wide"><input type="checkbox" checked={f.alternatives} onChange={(e) => setF({ ...f, alternatives: e.target.checked })} /> Show Anabelle’s unapproved alternatives from campaign tabs</label>
        </div>
        {f.market && <p className="small muted" style={{ marginTop: 8 }}>Market filter uses campaign tab membership. Location alone does not decide intent.</p>}
        <div className="list" role="listbox" aria-label="Copy lines">
          {seasonalGap && <div className="notice warn">No approved {f.intent === 'christmas' ? 'Christmas' : 'Advent calendar'} source copy exists in the workbook yet. Add it as a new variation; nothing is invented here.</div>}
          {shown.map((i) => {
            const L = i.langs[f.lang];
            return (
              <button key={i.sourceId} className="lineitem" role="option" aria-selected={sel === i.sourceId} onClick={() => setSel(i.sourceId)}>
                <div className="meta"><b>{i.sourceId}</b><span>{i.assetType}</span><span>{i.theme}</span>{i.isTest && <Tag tone="warn">Test item</Tag>}</div>
                <div className="text" lang={f.lang === 'DK' ? 'da' : f.lang === 'DE' ? 'de' : 'en'}>{L.text || <i className="muted">Not yet translated</i>}</div>
                <div className="meta" style={{ marginTop: 4 }}>
                  <span>{charCount(L.text)} chars</span>
                  {L.approvedAsIs ? <Tag tone="ok">Approved wording</Tag> : <Tag>Sheet wording · not approved</Tag>}
                  {L.open.length > 0 && <Tag tone="proposed">{L.open.length} open proposal{L.open.length > 1 ? 's' : ''}</Tag>}
                  {(L.recheck || L.englishChanging) && <Tag tone="warn">English changed — recheck</Tag>}
                </div>
              </button>
            );
          })}
          {lib.variations.filter((v: any) => v.language === f.lang).map((v: any) => (
            <button key={v.id} className="lineitem" onClick={() => setSel(`var:${v.id}`)} aria-selected={sel === `var:${v.id}`}>
              <div className="meta"><b>{v.sourceId}</b><Tag tone="proposed">New variation</Tag><StateTag state={v.state} /></div>
              <div className="text">{v.proposedText}</div>
            </button>
          ))}
          {alternatives.map((a: any, k: number) => (
            <div key={k} className="lineitem" style={{ cursor: 'default' }}>
              <div className="meta"><b>{a.campaign}</b><span>{a.assetType}</span><Tag tone="warn">Unapproved alternative</Tag></div>
              <div className="text">{a.text}</div>
              <div className="meta">{a.note}</div>
              <button className="btn small" style={{ marginTop: 6 }} onClick={() => setSel(`alt:${encodeURIComponent(JSON.stringify(a))}`)}>Use as new variation…</button>
            </div>
          ))}
          {!shown.length && !seasonalGap && <div className="empty">No lines match these filters.</div>}
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setSel('new')}>+ New variation (no existing line)</button>
      </aside>
      <section>
        {sel && (item || sel === 'new' || sel.startsWith('var:') || sel.startsWith('alt:'))
          ? <Editor key={`${sel}|${f.lang}`} lib={lib} item={item} sel={sel} lang={f.lang} onChanged={() => { load(); bump(); }} toast={toast} />
          : <div className="panel empty">Select a line to propose a replacement, add a variation or compare translations.</div>}
      </section>
    </div>
  );
}

function Editor({ lib, item, sel, lang, onChanged, toast }: { lib: any; item: any; sel: string; lang: Lang; onChanged: () => void; toast: (m: string) => void }) {
  const existingVar = sel.startsWith('var:') ? lib.variations.find((v: any) => `var:${v.id}` === sel) : null;
  const alt = sel.startsWith('alt:') ? JSON.parse(decodeURIComponent(sel.slice(4))) : null;
  const L = item?.langs[lang];
  const ownDraft = L?.open.find((r: any) => ['draft', 'changes_requested'].includes(r.state)) ?? null;
  const initialMode: Mode = existingVar || sel === 'new' || alt ? 'variation' : ownDraft?.kind ?? 'replace';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [rev, setRev] = useState<any>(existingVar ?? ownDraft ?? null);
  const [text, setText] = useState<string>(existingVar?.proposedText ?? ownDraft?.proposedText ?? alt?.text ?? (initialMode === 'replace' ? L?.text ?? '' : ''));
  const [reason, setReason] = useState<string>(rev?.reason ?? (alt ? `Adopted from Anabelle’s alternative in ${alt.campaign} (${alt.note})` : ''));
  const [assetType, setAssetType] = useState<string>(existingVar?.meta?.assetType ?? alt?.assetType ?? item?.assetType ?? 'Headline');
  const [targets, setTargets] = useState<{ campaign: string; group: string }[]>(existingVar?.meta?.targets ?? []);
  const [saveState, setSaveState] = useState<string>(rev ? `Draft saved locally ${fmtTime(rev.updatedAt)}` : '');
  const [basedOnEn, setBasedOnEn] = useState<string | null>(rev?.meta?.basedOnRevisionId ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = !rev || ['draft', 'changes_requested', 'submitted', 'approved'].includes(rev.state);
  const openEn = item?.langs.EN.open.filter((r: any) => r.kind === 'replace' && r.state !== 'withdrawn') ?? [];

  // Reset when switching mode (but keep a loaded draft of the same kind).
  const switchMode = (m: Mode) => {
    setMode(m);
    if (rev && rev.kind !== m) { setRev(null); setSaveState(''); }
    setText(m === 'replace' ? (rev?.kind === 'replace' ? rev.proposedText : L?.text ?? '') : m === 'variation' ? '' : '');
  };

  const persist = useCallback(async (next: { text: string; reason: string }): Promise<any> => {
    if (mode === 'replace' && !rev && next.text === (L?.text ?? '')) return null;
    setSaveState('Saving locally…');
    try {
      let r = rev;
      const meta = mode === 'variation' ? { assetType, targets, theme: item?.theme, intent: item?.intent, linkedHeadline: null } : undefined;
      if (!r) {
        r = await api('/api/revisions', { body: { kind: mode, sourceId: mode === 'variation' ? (existingVar?.sourceId ?? undefined) : item.sourceId, language: lang, proposedText: next.text, reason: next.reason, meta, basedOnRevisionId: basedOnEn } });
      } else {
        r = await api(`/api/revisions/${r.id}`, { method: 'PATCH', body: { proposedText: next.text, reason: next.reason, meta } });
      }
      setRev(r);
      setSaveState(`Draft saved locally ${fmtTime(r.updatedAt)} — the Sheet is not changed`);
      return r;
    } catch (e) { setSaveState(`Not saved: ${(e as Error).message}`); return null; }
  }, [mode, rev, L, assetType, targets, item, lang, existingVar, basedOnEn]);

  const onType = (v: string) => {
    setText(v);
    setSaveState('Unsaved changes…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist({ text: v, reason }), 900);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const submit = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const cur = (await persist({ text, reason })) ?? rev;
      if (!cur) throw new Error('Save the draft first.');
      const r = await api(`/api/revisions/${cur.id}/submit`, { body: {} });
      setRev(r); toast('Submitted for review. The Sheet is unchanged until an approver updates it.'); onChanged();
    } catch (e) { toast((e as Error).message); }
  };
  const withdraw = async () => { if (!rev) return; try { await api(`/api/revisions/${rev.id}/withdraw`, { body: {} }); toast('Proposal withdrawn.'); setRev(null); setText(L?.text ?? ''); onChanged(); } catch (e) { toast((e as Error).message); } };

  // ---- usages & previews
  const usages: any[] = mode === 'variation' ? targets.map((t) => ({ ...t, ...(lib.campaigns.find((c: any) => c.name === t.campaign) ?? {}) })) : (item?.usages ?? []).filter((u: any) => u.language === lang);
  const formats = [...new Set(usages.map((u: any) => u.format))] as string[];
  const effAssetType = mode === 'variation' ? assetType : item?.assetType ?? '';
  const validations = mode === 'retire' ? [] : validateText(text, effAssetType, formats as any);
  const [usageIdx, setUsageIdx] = useState(0);
  const usage = usages[Math.min(usageIdx, Math.max(0, usages.length - 1))];
  const [placement, setPlacement] = useState<PlacementKey>(placementsFor(usage?.format ?? 'search')[0]);
  useEffect(() => { if (usage) setPlacement((p) => (placementsFor(usage.format).includes(p) ? p : placementsFor(usage.format)[0])); }, [usage?.format]); // eslint-disable-line react-hooks/exhaustive-deps
  const editorStyle = useMemo(() => {
    const p = PLACEMENTS[placement];
    const s = /headline/i.test(effAssetType) ? p.headline : p.description;
    return { fontFamily: s.fontFamily, fontSize: s.fontSize, lineHeight: `${s.lineHeight}px` };
  }, [placement, effAssetType]);

  const unchanged = mode === 'replace' && text === (L?.text ?? '');
  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>{mode === 'variation' ? `New variation ${existingVar?.sourceId ?? `(will get ID ${lib.suggestedNewId})`}` : `${item.sourceId} · ${item.assetType}`}</h2>
            <div className="small muted">{item ? `${item.theme} · ${item.intent} · ${item.scope}` : 'Not yet in the Sheet'} · {LANG_NAME[lang]}</div>
          </div>
          {rev && <div className="row"><StateTag state={rev.state} />{rev.syncState !== 'none' && <SyncTag state={rev.syncState} />}<Link className="btn small" href={`/review/${rev.id}`}>Open in review</Link></div>}
        </div>
        {item && (
          <div className="seg" role="group" aria-label="What do you want to do?" style={{ marginTop: 14 }}>
            <button aria-pressed={mode === 'replace'} onClick={() => switchMode('replace')}>Replace wording</button>
            <button aria-pressed={mode === 'variation'} onClick={() => switchMode('variation')}>Add variation</button>
            <button aria-pressed={mode === 'retire'} onClick={() => switchMode('retire')}>Propose retirement</button>
          </div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>
          {mode === 'replace' && 'Replace wording: proposes new text for this exact line and language. Once approved and written, the previous text is replaced in the Sheet and Anabelle gets an exact before → after instruction.'}
          {mode === 'variation' && 'Add variation: adds an extra line with a new ID. Nothing existing is replaced. It is used only in the groups you choose below.'}
          {mode === 'retire' && 'Propose retirement: asks for this line to stop being used. The Sheet row is not deleted; Anabelle is told to remove or pause it.'}
        </p>
        {item?.isTest && <div className="notice warn">This is a labelled test item. It is excluded from previews of real campaigns and from every export.</div>}
        {rev?.state === 'written' && <div className="notice ok">This proposal was written to the Sheet. Start a new proposal to change it again.</div>}
        {rev?.syncDetail && rev.state !== 'written' && <div className="notice warn" style={{ marginTop: 8 }}>{rev.syncDetail}</div>}
      </div>

      {mode !== 'retire' && (
        <div className="panel">
          {lang !== 'EN' && item && (
            <div className="notice" style={{ marginBottom: 12 }}>
              <b>English source:</b> <span lang="en">{item.langs.EN.text}</span>
              {openEn.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <Tag tone="warn">An English change is open</Tag>{' '}
                  <label className="small"><input type="checkbox" style={{ width: 'auto' }} checked={!!basedOnEn} disabled={!!rev} onChange={(e) => setBasedOnEn(e.target.checked ? openEn[0].id : null)} /> Translate the proposed English instead: “{openEn[0].proposedText}” (can only be approved after that English is written)</label>
                </div>
              )}
            </div>
          )}
          <div className="compare">
            <div className="box">
              <h4>{mode === 'replace' ? 'Current Sheet wording' : 'Existing line (unchanged)'} <span className="small">{charCount(L?.text ?? '')} chars</span></h4>
              <div style={editorStyle} lang={lang === 'DK' ? 'da' : lang === 'DE' ? 'de' : 'en'}>{mode === 'variation' && !item ? <i className="muted">—</i> : (L?.text || <i className="muted">Not yet translated</i>)}</div>
            </div>
            <div className="box proposed">
              <h4>{mode === 'replace' ? 'Proposed replacement' : 'New variation wording'} <span className="small">{charCount(text)} chars</span></h4>
              <textarea aria-label="Proposed wording" className="editorText" style={editorStyle} value={text} onChange={(e) => onType(e.target.value)} disabled={!editable || rev?.state === 'written'} lang={lang === 'DK' ? 'da' : lang === 'DE' ? 'de' : 'en'} />
            </div>
          </div>
          <div className="counter">
            {formats.length ? formats.map((fm) => {
              const lim = limitFor(effAssetType, fm as any);
              const spec = (FORMAT_SPECS as any)[fm];
              return <span key={fm} className={lim && charCount(text) > lim.max ? 'over' : ''}>{spec?.label ?? fm}: {charCount(text)}{lim ? ` / ${lim.max}` : ' (no limit for this asset type)'}{lim && !lim.verified ? ' (provisional)' : ''}</span>;
            }) : <span>No campaign usage in {LANG_NAME[lang]} — no character limit applied.</span>}
          </div>
          {mode === 'replace' && !unchanged && L?.text && <p className="small" style={{ marginTop: 8 }}>Change: <Diff a={L.text} b={text} /></p>}
          {validations.filter((v) => v.level !== 'info').map((v, i) => <div key={i} className={`notice ${v.level === 'error' ? 'bad' : 'warn'}`} style={{ marginTop: 6 }}>{v.message}</div>)}
          {lang === 'EN' && item && mode === 'replace' && !unchanged && (item.langs.DK.text || item.langs.DE.text) && <div className="notice warn" style={{ marginTop: 8 }}>Changing the English will flag the Danish and German translations for re-review.</div>}
        </div>
      )}

      {mode === 'variation' && (
        <div className="panel">
          <h3>Where would this variation be used?</h3>
          <p className="small muted">Nothing is distributed automatically. Choose groups deliberately; suggestions come from where the selected line is used.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            <label className="field" style={{ width: 220 }}><span>Asset type</span>
              <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>{['Headline', 'Long headline', 'Description'].map((t) => <option key={t}>{t}</option>)}</select>
            </label>
          </div>
          <div className="chips">
            {lib.campaigns.filter((c: any) => c.language === lang).flatMap((c: any) => c.groups.map((g: string) => ({ campaign: c.name, group: g }))).map((t: any) => {
              const on = targets.some((x) => x.campaign === t.campaign && x.group === t.group);
              const suggested = item?.usages.some((u: any) => u.campaign === t.campaign && u.group === t.group);
              return <button key={`${t.campaign}|${t.group}`} className="chip" aria-pressed={on} onClick={() => setTargets(on ? targets.filter((x) => !(x.campaign === t.campaign && x.group === t.group)) : [...targets, t])}>{t.campaign} / {t.group}{suggested ? ' ★' : ''}</button>;
            })}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>★ = where the selected line is currently used.</p>
        </div>
      )}

      {mode === 'retire' && item && (
        <div className="panel">
          <h3>Retire “{L?.text}”</h3>
          <p className="small">Currently used in: {item.usages.filter((u: any) => u.language === lang).map((u: any) => `${u.campaign} / ${u.group}`).join('; ') || 'no campaign tab'}</p>
        </div>
      )}

      <div className="panel">
        <label className="field"><span>Reason for the change {mode === 'retire' && '(required)'}</span>
          <textarea rows={2} value={reason} onChange={(e) => { setReason(e.target.value); if (rev || text !== (L?.text ?? '')) { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => persist({ text, reason: e.target.value }), 900); } }} />
        </label>
        <div className="chips" style={{ marginTop: 6 }}>{REASONS.map((r) => <button key={r} className="chip" onClick={() => setReason(reason ? `${reason}; ${r}` : r)}>{r}</button>)}</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => persist({ text, reason })} disabled={(mode === 'replace' && unchanged && !rev) || !editable}>Save draft</button>
          <button className="btn primary" onClick={submit} disabled={(mode === 'replace' && unchanged) || (mode === 'retire' && !reason.trim()) || (mode === 'variation' && !text.trim()) || rev?.state === 'submitted' || rev?.state === 'written' || validations.some((v) => v.level === 'error')}>Submit for review</button>
          {rev && !['written', 'withdrawn'].includes(rev.state) && <button className="btn danger" onClick={withdraw}>Withdraw</button>}
          <span className="small muted" aria-live="polite">{saveState || 'Typing saves a local draft only. The Sheet is never changed from here.'}</span>
        </div>
        {rev?.state === 'submitted' && <p className="small muted" style={{ marginTop: 6 }}>Editing a submitted or approved proposal returns it to draft and invalidates any approval.</p>}
      </div>

      {item && <TranslationCompare item={item} lang={lang} onChanged={onChanged} />}

      {mode !== 'retire' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Live preview with compatible copy</h3>
            {usage && (
              <div className="seg" role="group" aria-label="Placement">
                {placementsFor(usage.format).map((p) => <button key={p} aria-pressed={placement === p} onClick={() => setPlacement(p)}>{PLACEMENTS[p].label}</button>)}
              </div>
            )}
          </div>
          {usages.length > 1 && (
            <label className="field" style={{ maxWidth: 420, marginTop: 10 }}><span>Campaign group</span>
              <select value={usageIdx} onChange={(e) => setUsageIdx(Number(e.target.value))}>{usages.map((u: any, i: number) => <option key={i} value={i}>{u.campaign} / {u.group}</option>)}</select>
            </label>
          )}
          {usage ? <GroupPreviews usage={usage} sourceId={item?.sourceId ?? existingVar?.sourceId ?? lib.suggestedNewId} draft={text} assetType={effAssetType} mode={mode} placement={placement} /> : <div className="empty" style={{ marginTop: 10 }}>{mode === 'variation' ? 'Choose at least one group above to preview this variation with compatible copy.' : `This line is not used in any ${LANG_NAME[lang]} campaign tab, so there is nothing compatible to preview it with.`}</div>}
        </div>
      )}

      {item && (L?.open.length > 0 || L?.writtenUnacknowledged.length > 0) && (
        <div className="panel">
          <h3>Proposals for this line ({LANG_NAME[lang]})</h3>
          <table className="t"><tbody>
            {[...L.open, ...L.writtenUnacknowledged].map((r: any) => (
              <tr key={r.id}><td><StateTag state={r.state} /></td><td>{r.kind === 'replace' ? 'Replace' : r.kind === 'variation' ? 'Variation' : 'Retire'}</td><td>{r.proposedText || <i>retire</i>}</td><td className="small muted">{fmtTime(r.updatedAt)}</td><td><Link href={`/review/${r.id}`}>Open</Link></td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

function TranslationCompare({ item, lang, onChanged }: { item: any; lang: Lang; onChanged: () => void }) {
  const { role, toast } = useStudio();
  const isApprover = /approver|reviewer/i.test(role);
  const approveAsIs = async (l: Lang) => {
    if (!confirm(`Approve the current ${LANG_NAME[l]} wording of ${item.sourceId} exactly as it is in the Sheet?\n\n“${item.langs[l].text}”${l !== 'EN' ? `\n\nThis approval also covers the English: “${item.langs.EN.text}”.` : ''}\n\nThe Sheet is not changed.`)) return;
    try { await api('/api/approvals/as-is', { body: { sourceId: item.sourceId, language: l } }); toast('Current wording approved as is.'); onChanged(); } catch (e) { toast((e as Error).message); }
  };
  const revoke = async (id: string) => { try { await api(`/api/approvals/${id}/revoke`, { body: { reason: 'Approval withdrawn' } }); toast('Approval withdrawn.'); onChanged(); } catch (e) { toast((e as Error).message); } };
  return (
    <div className="panel">
      <h3>Translations side by side</h3>
      <div className="grid3">
        {(['EN', 'DK', 'DE'] as Lang[]).map((l) => (
          <div key={l} style={{ borderLeft: l === lang ? '3px solid var(--accent)' : '3px solid var(--line)', paddingLeft: 10 }}>
            <h4>{LANG_NAME[l]}</h4>
            <div lang={l === 'DK' ? 'da' : l === 'DE' ? 'de' : 'en'}>{item.langs[l].text || <i className="muted">Not yet translated</i>}</div>
            <div className="row small" style={{ marginTop: 6 }}>
              <span className="muted">{charCount(item.langs[l].text)} chars</span>
              {item.langs[l].approvedAsIs ? <Tag tone="ok">Approved</Tag> : <Tag>{item.langs[l].sheetStatus || 'Not approved'}</Tag>}
              {l !== 'EN' && (item.langs[l].recheck || item.langs[l].englishChanging) && <Tag tone="warn">Recheck against English</Tag>}
            </div>
            {isApprover && item.langs[l].text && !item.isTest && (item.langs[l].approvedAsIs
              ? <button className="btn small" style={{ marginTop: 6 }} onClick={() => revoke(item.langs[l].approvalId)}>Withdraw approval</button>
              : <button className="btn small" style={{ marginTop: 6 }} onClick={() => approveAsIs(l)}>Approve as is</button>)}
          </div>
        ))}
      </div>
      {item.note && <p className="small muted" style={{ marginTop: 10 }}>Review note: {item.note}</p>}
      {item.linkedHeadline && <p className="small" style={{ marginTop: 4 }}>Linked headline: <b>{item.linkedHeadline}</b> — keep this pairing together.</p>}
      {item.shortened && <p className="small" style={{ marginTop: 4 }}>Shortened proposal in the Sheet (separate, not approved): “{item.shortened}”</p>}
    </div>
  );
}

function GroupPreviews({ usage, sourceId, draft, assetType, mode, placement }: { usage: any; sourceId: string; draft: string; assetType: string; mode: Mode; placement: PlacementKey }) {
  const [data, setData] = useState<any>(null);
  const [n, setN] = useState(4);
  useEffect(() => {
    api(`/api/group?campaign=${encodeURIComponent(usage.campaign)}&group=${encodeURIComponent(usage.group)}`).then(setData).catch(() => setData(null));
  }, [usage.campaign, usage.group]);
  const combos: Combo[] = useMemo(() => {
    if (!data) return [];
    const ctx: GroupContext = data.ctx;
    let assets = ctx.assets.map((a) => (a.sourceId === sourceId && mode === 'replace' ? { ...a, text: draft, state: 'editing' as const, label: 'Your draft' } : a));
    if (mode === 'variation') assets = [...assets, { sourceId, assetType, text: draft || '…', linkedHeadline: null, state: 'editing' as const, label: 'Your draft' }];
    const res = generateCombos({ ...ctx, assets }, new Map(Object.entries(data.englishHeadlines)));
    return res.all.filter((c) => c.slots.some((s) => s.sourceId === sourceId));
  }, [data, draft, sourceId, mode, assetType]);
  if (!data) return <p className="muted small">Loading compatible copy…</p>;
  return (
    <div style={{ marginTop: 12 }}>
      <TypographyNote placement={placement} />
      <p className="small muted" style={{ marginTop: 8 }}>{usage.campaign} / {usage.group} · {combos.length} illustrative combinations include this line{data.ctx.format === 'search' && Object.keys(data.ctx.pins).length ? ' · pinning proposal respected' : ''}{data.ctx.format !== 'search' ? ' · no pinning in Performance Max' : ''}. Highlighted = your draft.</p>
      {data.mapRow && <p className="small muted">Intent: {data.mapRow.intent} · Destination: {data.mapRow.destination} · Rule: {data.mapRow.rule}</p>}
      <div className="gallery" style={{ marginTop: 10 }}>
        {combos.slice(0, n).map((c) => <PreviewCard key={c.key} combo={c} placement={placement} destination={data.mapRow?.destination} />)}
      </div>
      {!combos.length && <div className="empty">No compatible combination: this group lacks the headlines/descriptions needed (or the line has a linked headline that is not in this group).</div>}
      {combos.length > n && <button className="btn" style={{ marginTop: 10 }} onClick={() => setN(n + 6)}>Show more combinations ({combos.length - n} more)</button>}
    </div>
  );
}
