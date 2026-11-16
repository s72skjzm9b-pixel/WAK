'use client';
import { useEffect, useState } from 'react';
import { api, useStudio } from '@/components/client';
import { FORMAT_LABEL, type WCollection } from '@/lib/workspace';

const CTAS = ['', 'Automated (Google chooses)', 'Shop now', 'Learn more', 'Subscribe', 'Get directions', 'Sign up', 'Order now', 'Visit site'];

export function CollectionBrief({ col, langName, allLangs, reload }: { col: WCollection; langName: (c: string) => string; allLangs: { code: string; name: string }[]; reload: () => void }) {
  const { toast } = useStudio();
  const [f, setF] = useState(() => ({ name: col.name, description: col.description, imageNote: col.imageNote, formats: col.intendedFormats as string[], languages: col.studioLanguages, ...col.details }));
  useEffect(() => setF({ name: col.name, description: col.description, imageNote: col.imageNote, formats: col.intendedFormats as string[], languages: col.studioLanguages, finalUrl: col.details.finalUrl, path1: col.details.path1, path2: col.details.path2, cta: col.details.cta }), [col.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (patch: any) => {
    try { await api(`/api/collections/${col.key}`, { method: 'PATCH', body: patch }); reload(); } catch (e) { toast((e as Error).message); }
  };
  const mappedFormats = [...new Set(Object.values(col.formats).flat())];
  const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <div className="ws-head">
      <h1>{col.name}</h1>
      <p className="summary">
        <span>{col.intent}</span>
        <span>{col.audience}</span>
        {col.languages.length > 0 && <span>{col.languages.map((l) => `${langName(l)}${col.markets[l]?.length ? ` (${col.markets[l].join(', ')})` : ''}`).join(' · ')}</span>}
        <span>{col.details.finalUrl ? col.details.finalUrl : col.destination}{!col.destinationConfirmed && !col.details.finalUrl && <em className="unconf"> · unconfirmed</em>}</span>
        {col.isLocal && <span className="qtag">Studio only · not mapped</span>}
      </p>
      {col.description && <p className="desc">{col.description}</p>}
      <details className="brief">
        <summary>Collection details</summary>
        <div className="briefgrid">
          <label className="field"><span>Name</span><input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => f.name.trim() && f.name !== col.name && save({ name: f.name })} /></label>
          <label className="field"><span>Short description / purpose</span><input type="text" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} onBlur={() => save({ description: f.description })} /></label>
          <label className="field"><span>Image direction (optional)</span><input type="text" value={f.imageNote ?? ''} placeholder="e.g. warm daylight, cups on the counter" onChange={(e) => setF({ ...f, imageNote: e.target.value })} onBlur={() => save({ imageNote: f.imageNote })} /></label>
          <fieldset className="field"><legend>Intended formats</legend>
            <div className="chips">{['search', 'pmax', 'demand_gen'].map((x) => <button key={x} type="button" className="chip" aria-pressed={f.formats.includes(x)} onClick={() => { const formats = toggle(f.formats, x); setF({ ...f, formats }); save({ formats }); }}>{FORMAT_LABEL[x]}{mappedFormats.includes(x as any) ? ' · mapped' : ''}</button>)}</div>
          </fieldset>
          <fieldset className="field"><legend>Languages shown here</legend>
            <div className="chips">{allLangs.map((l) => <button key={l.code} type="button" className="chip" aria-pressed={f.languages.includes(l.code)} onClick={() => { const languages = toggle(f.languages, l.code); if (!languages.length) return; setF({ ...f, languages }); save({ languages }); }}>{l.name}</button>)}</div>
          </fieldset>
          <label className="field"><span>Final URL</span><input type="text" value={f.finalUrl ?? ''} placeholder={col.destination} onChange={(e) => setF({ ...f, finalUrl: e.target.value })} onBlur={() => save({ details: { finalUrl: f.finalUrl, path1: f.path1, path2: f.path2, cta: f.cta } })} /></label>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}><span>Display path 1 ({(f.path1 ?? '').length}/15)</span><input type="text" maxLength={15} value={f.path1 ?? ''} onChange={(e) => setF({ ...f, path1: e.target.value })} onBlur={() => save({ details: { finalUrl: f.finalUrl, path1: f.path1, path2: f.path2, cta: f.cta } })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Display path 2 ({(f.path2 ?? '').length}/15)</span><input type="text" maxLength={15} value={f.path2 ?? ''} onChange={(e) => setF({ ...f, path2: e.target.value })} onBlur={() => save({ details: { finalUrl: f.finalUrl, path1: f.path1, path2: f.path2, cta: f.cta } })} /></label>
          </div>
          <label className="field"><span>Call to action (a Google preset, not written copy)</span>
            <select value={f.cta ?? ''} onChange={(e) => { const cta = e.target.value; setF({ ...f, cta }); save({ details: { finalUrl: f.finalUrl, path1: f.path1, path2: f.path2, cta } }); }}>{CTAS.map((c) => <option key={c} value={c}>{c || 'Not chosen'}</option>)}</select>
          </label>
          {!col.isLocal && <p className="small muted">From the Sheet (read-only): {col.groups.length ? `${col.groups.length} ad group mappings in ${[...new Set(col.groups.map((g) => g.campaign))].length} campaign tabs` : 'no mappings'}. Renaming changes only this label.</p>}
        </div>
      </details>
    </div>
  );
}
