// Combination feedback. Identity = format + language + every slot's source ID AND exact wording.
// A verdict is reversible: setting the same verdict again clears it; the other verdict replaces it.
// Older verdicts are kept quietly as history (superseded). Comments are separate from verdicts.
import type { Studio, Actor } from './studio';
import { StudioError } from './studio';
import { newId, now } from '../store/repo';

export interface ComboInput { key: string; campaign: string; group: string; format: string; language: string; slots: { slot: string; sourceId: string; text: string; state?: string }[] }
export type Scope = { kind: 'combination' } | { kind: 'lines'; lines: { sourceId: string; slot: string }[] };

export function identity(c: { format: string; language: string; slots: { slot: string; sourceId: string; text: string }[] }) {
  return [c.format, c.language, ...c.slots.map((s) => `${s.slot}=${s.sourceId}:${s.text}`)].join('|');
}

const who = (a: Actor) => a.name || 'Local user';

export function setVerdict(studio: Studio, input: { combo: ComboInput; verdict: 'works' | 'needs_changes' | null; scope?: Scope }, actor: Actor) {
  if (!input.combo?.slots?.length || !input.combo.language) throw new StudioError(400, 'Missing combination.');
  const id = identity(input.combo);
  const active = studio.repo.activeVerdicts().filter((f) => identity({ ...f.combo, language: f.language ?? f.combo.language }) === id);
  const current = active[active.length - 1];
  for (const f of active) studio.repo.supersedeFeedback(f.id);
  // Clicking the selected verdict again clears it.
  const same = current && current.verdict === input.verdict && JSON.stringify(current.scope ?? { kind: 'combination' }) === JSON.stringify(input.scope ?? { kind: 'combination' });
  if (!input.verdict || same) return { cleared: true };
  if (input.scope?.kind === 'lines') {
    for (const l of input.scope.lines) if (!input.combo.slots.some((s) => s.sourceId === l.sourceId && s.slot === l.slot)) throw new StudioError(400, 'The selected line is not in this combination.');
  }
  const fid = newId('fb');
  studio.repo.insertFeedback({ id: fid, comboKey: input.combo.key, combo: input.combo, verdict: input.verdict, reasons: [], comment: '', reviewer: who(actor), createdAt: now(), resolvedAt: null, resolution: null });
  studio.repo.setFeedbackMeta(fid, input.scope ?? { kind: 'combination' }, input.combo.language);
  return { cleared: false, id: fid };
}

export function resolveVerdict(studio: Studio, id: string, note: string) {
  studio.repo.resolveFeedback(id, note || 'Resolved');
}

export function addComment(studio: Studio, input: { combo: ComboInput; text: string }, actor: Actor) {
  if (!input.text?.trim()) throw new StudioError(400, 'Write a comment first.');
  return { id: studio.repo.addComment({ comboKey: input.combo.key, combo: input.combo, language: input.combo.language, text: input.text.trim(), author: who(actor) }) };
}
