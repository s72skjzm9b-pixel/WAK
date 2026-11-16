'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface DialogAction { label: string; value: string; primary?: boolean; danger?: boolean }
export interface DialogSpec { title: string; body?: React.ReactNode; actions: DialogAction[]; input?: { label: string; initial?: string; placeholder?: string; multiline?: boolean; required?: boolean } }
interface Ctx {
  name: string; setName: (n: string) => void;
  /** Small in-app dialog. Resolves with the chosen action value (and the text, if any); 'cancel' when dismissed. */
  ask: (spec: DialogSpec) => Promise<{ value: string; text: string }>;
  /** Make sure a name is recorded before feedback/review actions. Returns false if the user cancels. */
  ensureName: () => Promise<boolean>;
  status: any; reloadStatus: () => Promise<void>; toast: (m: string) => void; version: number; bump: () => void;
}
const C = createContext<Ctx | null>(null);
export const useStudio = () => useContext(C)!;

const current = { name: '' };

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'x-studio-client': '1', 'x-studio-name': encodeURIComponent(current.name) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
export function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [name, setNameS] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => { const n = safeGet('studio.name'); if (n) { setNameS(n); current.name = n; } }, []);
  const setName = (n: string) => { current.name = n; setNameS(n); safeSet('studio.name', n); };
  const reloadStatus = useCallback(async () => { try { setStatus(await api('/api/status')); } catch (e) { setStatus({ error: (e as Error).message }); } }, []);
  useEffect(() => { reloadStatus(); }, [reloadStatus]);
  const toast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4200); };
  const bump = () => setVersion((v) => v + 1);
  const [dialog, setDialog] = useState<(DialogSpec & { resolve: (r: { value: string; text: string }) => void }) | null>(null);
  const ask = (spec: DialogSpec) => new Promise<{ value: string; text: string }>((resolve) => setDialog({ ...spec, resolve }));
  const ensureName = async () => {
    if (current.name.trim()) return true;
    const r = await ask({ title: 'What’s your name?', body: 'It is saved with your feedback and reviews so others know who said what. It is not a sign-in.', input: { label: 'Your name', required: true, placeholder: 'e.g. Christian' }, actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'ok', primary: true }] });
    if (r.value !== 'ok' || !r.text.trim()) return false;
    setName(r.text.trim());
    return true;
  };
  return (
    <C.Provider value={{ name, setName, status, reloadStatus, toast, version, bump, ask, ensureName }}>
      {children}
      {dialog && <DialogView spec={dialog} onClose={(r) => { dialog.resolve(r); setDialog(null); }} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </C.Provider>
  );
}

export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'proposed' | 'accent'; children: React.ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export const STATE_LABEL: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'bad' | 'proposed' | 'accent' }> = {
  draft: { label: 'Draft (local only)', tone: 'neutral' },
  submitted: { label: 'Proposed — in review', tone: 'proposed' },
  changes_requested: { label: 'Changes requested', tone: 'warn' },
  approved: { label: 'Approved — not in Sheet yet', tone: 'accent' },
  written: { label: 'Written to Sheet', tone: 'ok' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  superseded: { label: 'Superseded', tone: 'neutral' },
};
export const SYNC_LABEL: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'bad' | 'proposed' | 'accent' }> = {
  none: { label: 'Not synced', tone: 'neutral' },
  pending: { label: 'Sheet update pending', tone: 'warn' },
  conflict: { label: 'Conflict — Sheet changed', tone: 'bad' },
  failed: { label: 'Sheet write failed', tone: 'bad' },
  written: { label: 'Sheet updated & verified', tone: 'ok' },
  local_only: { label: 'Kept local (not in Sheet)', tone: 'warn' },
};
export function StateTag({ state }: { state: string }) { const s = STATE_LABEL[state] ?? { label: state, tone: 'neutral' as const }; return <Tag tone={s.tone}>{s.label}</Tag>; }
export function SyncTag({ state }: { state: string }) { const s = SYNC_LABEL[state] ?? { label: state, tone: 'neutral' as const }; return <Tag tone={s.tone}>{s.label}</Tag>; }

export const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Word-level diff for "previous → proposed" display. */
export function Diff({ a, b }: { a: string; b: string }) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: React.ReactNode[] = []; let i = 0, j = 0, k = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push(<span key={k++}>{A[i]}</span>); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(<del key={k++}>{A[i]}</del>); i++; }
    else { out.push(<ins key={k++}>{B[j]}</ins>); j++; }
  }
  while (i < n) out.push(<del key={k++}>{A[i++]}</del>);
  while (j < m) out.push(<ins key={k++}>{B[j++]}</ins>);
  return <span className="diff">{out}</span>;
}

function DialogView({ spec, onClose }: { spec: DialogSpec; onClose: (r: { value: string; text: string }) => void }) {
  const [text, setText] = useState(spec.input?.initial ?? '');
  const ref = useCallback((el: HTMLElement | null) => { el?.querySelector<HTMLElement>('input, textarea, button[data-primary]')?.focus(); }, []);
  const choose = (a: DialogAction) => { if (a.primary && spec.input?.required && !text.trim()) return; onClose({ value: a.value, text }); };
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose({ value: 'cancel', text }); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={ref}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose({ value: 'cancel', text }); if (e.key === 'Enter' && !spec.input?.multiline && (e.target as HTMLElement).tagName === 'INPUT') { const p = spec.actions.find((a) => a.primary); if (p) choose(p); } }}>
        <h2 id="dlg-title">{spec.title}</h2>
        {spec.body && <div className="dlg-body">{spec.body}</div>}
        {spec.input && (
          <label className="field"><span>{spec.input.label}</span>
            {spec.input.multiline ? <textarea rows={3} value={text} placeholder={spec.input.placeholder} onChange={(e) => setText(e.target.value)} />
              : <input type="text" value={text} placeholder={spec.input.placeholder} onChange={(e) => setText(e.target.value)} />}
          </label>
        )}
        <div className="dlg-actions">
          {spec.actions.map((a) => <button key={a.value} data-primary={a.primary ? '' : undefined} className={`btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`} disabled={a.primary && spec.input?.required && !text.trim()} onClick={() => choose(a)}>{a.label}</button>)}
        </div>
      </div>
    </div>
  );
}

/** Small modal for short forms. Escape or clicking outside closes it. */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        ref={(el) => { if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('input, select, textarea, button')?.focus(); }}>
        <h2>{title}</h2>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-actions">{footer}</div>}
      </div>
    </div>
  );
}
