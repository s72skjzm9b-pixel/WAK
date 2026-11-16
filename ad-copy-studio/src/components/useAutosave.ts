'use client';
// Resilient autosave for drafts.
// - Every keystroke goes into a local journal (localStorage) first, so a reload, quick navigation, closed tab
//   or failed request never loses the latest wording.
// - Each edit has a sequence number; a save only clears the journal if it saved the LATEST version, so an
//   older response can never make the screen say “saved” while newer wording is still pending.
// - Saves for one row are serialised (a new line must get its ID before its translations are saved).
// - Saves are flushed on blur, when the page is hidden and before unload (with keepalive).
import { useCallback, useEffect, useRef, useState } from 'react';

export interface JournalEntry {
  rowKey: string; // stable key of the row on screen (tmp-… for a new line until it has an ID)
  sourceId: string | null; // known ID (existing line, or new line after its first save)
  isNew: boolean;
  collection: string;
  assetType: string;
  linkedHeadlineId: string | null;
  lang: string;
  text: string;
  seq: number;
  status: 'pending' | 'saving' | 'failed';
  error?: string;
  recovered?: boolean;
}
export type SaveSummary = 'idle' | 'saving' | 'saved' | 'failed' | 'recovered';

const JOURNAL = 'ws.journal.v2';
const IDS = 'ws.tempIds.v2';
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const store = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: still saved on server when possible */ } };
const jkey = (rowKey: string, lang: string) => `${rowKey}|${lang}`;

export function useAutosave(opts: { onServerChange: () => void; headers: () => Record<string, string> }) {
  const [journal, setJournal] = useState<Record<string, JournalEntry>>({});
  const [tempIds, setTempIds] = useState<Record<string, string>>({}); // tmp row key → NEW-### after first save
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const ref = useRef(journal); ref.current = journal;
  const idsRef = useRef(tempIds); idsRef.current = tempIds;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const chains = useRef<Record<string, Promise<unknown>>>({});
  const seq = useRef(Date.now());

  const commit = (next: Record<string, JournalEntry>) => { ref.current = next; setJournal(next); store(JOURNAL, next); };
  const setIds = (next: Record<string, string>) => { idsRef.current = next; setTempIds(next); store(IDS, next); };

  // Recover anything that was not confirmed as saved last time, and retry it.
  useEffect(() => {
    const j = load<Record<string, JournalEntry>>(JOURNAL, {});
    const ids = load<Record<string, string>>(IDS, {});
    setIds(ids);
    const rec: Record<string, JournalEntry> = {};
    for (const [k, e] of Object.entries(j)) rec[k] = { ...e, status: 'pending', recovered: true };
    commit(rec);
    for (const k of Object.keys(rec)) send(k);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const idFor = (e: JournalEntry) => e.sourceId ?? idsRef.current[e.rowKey] ?? null;

  const send = useCallback((k: string) => {
    const first = ref.current[k];
    if (!first) return;
    chains.current[first.rowKey] = (chains.current[first.rowKey] ?? Promise.resolve()).then(async () => {
      const e = ref.current[k];
      if (!e) return;
      const id = idFor(e);
      if (e.isNew && !id && e.lang !== 'EN') { commit({ ...ref.current, [k]: { ...e, status: 'failed', error: 'Write the English first.' } }); return; }
      const sentSeq = e.seq;
      commit({ ...ref.current, [k]: { ...e, status: 'saving' } });
      try {
        const res = await fetch('/api/suggestions', {
          method: 'PUT', headers: opts.headers(), cache: 'no-store',
          body: JSON.stringify(e.isNew
            ? { isNew: true, sourceId: id, collection: e.collection, assetType: e.assetType, linkedHeadlineId: e.linkedHeadlineId, language: e.lang, text: e.text, clientSeq: sentSeq }
            : { sourceId: e.sourceId, language: e.lang, text: e.text, clientSeq: sentSeq }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Could not save (${res.status})`);
        if (e.isNew && !id && data.revision?.sourceId) {
          setIds({ ...idsRef.current, [e.rowKey]: data.revision.sourceId });
          // Other languages of this new line can now be saved.
          for (const [ok, oe] of Object.entries(ref.current)) if (oe.rowKey === e.rowKey && ok !== k && oe.status === 'failed') { commit({ ...ref.current, [ok]: { ...oe, status: 'pending', error: undefined } }); send(ok); }
        }
        const now = ref.current[k];
        if (now && now.seq === sentSeq) { const next = { ...ref.current }; delete next[k]; commit(next); setLastSavedAt(Date.now()); }
        else if (now) commit({ ...ref.current, [k]: { ...now, status: 'pending' } }); // newer wording still to save
        opts.onServerChange();
      } catch (err) {
        const now = ref.current[k];
        if (now) commit({ ...ref.current, [k]: { ...now, status: 'failed', error: (err as Error).message } });
      }
    });
  }, [opts]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = useCallback((e: Omit<JournalEntry, 'seq' | 'status'>, delay = 700) => {
    const k = jkey(e.rowKey, e.lang);
    seq.current += 1;
    commit({ ...ref.current, [k]: { ...e, seq: seq.current, status: 'pending' } });
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => send(k), delay);
  }, [send]);

  const flush = useCallback((rowKey?: string, lang?: string) => {
    for (const k of Object.keys(ref.current)) {
      const e = ref.current[k];
      if ((rowKey && e.rowKey !== rowKey) || (lang && e.lang !== lang)) continue;
      if (e.status === 'pending') { clearTimeout(timers.current[k]); send(k); }
    }
  }, [send]);

  const retry = useCallback(() => {
    for (const [k, e] of Object.entries(ref.current)) if (e.status === 'failed') { commit({ ...ref.current, [k]: { ...e, status: 'pending', error: undefined } }); send(k); }
  }, [send]);

  // Leaving the page: the journal is already stored; also try to deliver pending edits.
  useEffect(() => {
    const out = () => {
      for (const e of Object.values(ref.current)) {
        if (e.status === 'saving') continue;
        const id = idFor(e);
        if (e.isNew && !id) continue; // would risk a duplicate new line; recovered on next open instead
        try {
          fetch('/api/suggestions', { method: 'PUT', keepalive: true, headers: opts.headers(), body: JSON.stringify(e.isNew
            ? { isNew: true, sourceId: id, collection: e.collection, assetType: e.assetType, linkedHeadlineId: e.linkedHeadlineId, language: e.lang, text: e.text, clientSeq: e.seq }
            : { sourceId: e.sourceId, language: e.lang, text: e.text, clientSeq: e.seq }) });
        } catch { /* recovered next time */ }
      }
    };
    const vis = () => { if (document.visibilityState === 'hidden') { out(); } };
    window.addEventListener('pagehide', out);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pagehide', out); document.removeEventListener('visibilitychange', vis); };
  }, [opts]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = Object.values(journal);
  const summary: SaveSummary = entries.some((e) => e.status === 'failed') ? 'failed'
    : entries.some((e) => e.recovered) ? 'recovered'
    : entries.length ? 'saving' : lastSavedAt ? 'saved' : 'idle';

  /** Current unsaved text by display key (sourceId-or-tmpKey|lang). */
  const edits: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const e of entries) {
    const id = e.sourceId ?? tempIds[e.rowKey] ?? e.rowKey;
    edits[`${id}|${e.lang}`] = e.text;
    if (e.status === 'failed' && e.error) errors[`${id}|${e.lang}`] = e.error;
  }
  const pendingFor = (rowKey: string) => entries.filter((e) => e.rowKey === rowKey);
  return { edit, flush, retry, summary, edits, errors, tempIds, pendingFor, journal };
}
