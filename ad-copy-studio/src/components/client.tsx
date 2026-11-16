'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface Ctx {
  name: string; setName: (n: string) => void;
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
  return (
    <C.Provider value={{ name, setName, status, reloadStatus, toast, version, bump }}>
      {children}
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
