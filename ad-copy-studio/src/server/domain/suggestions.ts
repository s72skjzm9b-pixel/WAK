// Direct editing: every edit is autosaved as a local suggestion. Nothing here writes to the Sheet;
// only accept() (Changes view) can, through the existing conflict-checked write path.
import type { Lang } from '../workbook/types';
import { Studio, StudioError, type Actor } from './studio';
import type { Revision } from '../store/repo';
import { newId } from '../store/repo';

const OPEN = ['draft', 'submitted', 'changes_requested', 'approved'];
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function openSuggestion(studio: Studio, sourceId: string, lang: Lang, kind: 'replace' | 'variation' = 'replace'): Revision | null {
  return studio.repo.listRevisions({ sourceId, language: lang }).find((r) => r.kind === kind && OPEN.includes(r.state)) ?? null;
}

/** The English a translation of this line should be checked against: the suggested English if there is one. */
export async function effectiveEnglish(studio: Studio, sourceId: string): Promise<{ text: string; revisionId: string | null }> {
  const en = openSuggestion(studio, sourceId, 'EN', 'replace');
  if (en) return { text: en.proposedText, revisionId: en.id };
  const v = openSuggestion(studio, sourceId, 'EN', 'variation');
  if (v) return { text: v.proposedText, revisionId: v.id };
  const item = await studio.item(sourceId);
  return { text: item?.versions.EN.text ?? '', revisionId: null };
}

/** Edit the wording of an existing Sheet line in one language. Same text as the Sheet = revert. */
export async function saveEdit(studio: Studio, input: { sourceId: string; language: Lang; text: string }, actor: Actor) {
  const item = await studio.item(input.sourceId);
  if (!item) throw new StudioError(404, 'This line is no longer in the Sheet. Refresh to see the current copy.');
  const sheetText = item.versions[input.language].text;
  const open = openSuggestion(studio, input.sourceId, input.language);
  if (input.text === sheetText) {
    if (open) await studio.withdraw(open.id, actor);
    return { status: 'reverted' as const, revision: null };
  }
  const en = input.language === 'EN' ? null : await effectiveEnglish(studio, input.sourceId);
  let rev: Revision;
  if (open) rev = await studio.editRevision(open.id, { proposedText: input.text, ...(en ? { englishBasis: en.text } : {}) }, actor);
  else rev = await studio.createRevision({ kind: 'replace', sourceId: input.sourceId, language: input.language, proposedText: input.text, basedOnRevisionId: en?.revisionId ?? null }, actor);
  return { status: 'saved' as const, revision: rev };
}

function duplicateOf(studio: Studio, lib: Awaited<ReturnType<Studio['workbook']>>['library'], lang: Lang, text: string, exceptSourceId?: string): string | null {
  const t = norm(text);
  if (!t) return null;
  const sheet = lib.find((i) => i.sourceId !== exceptSourceId && norm(i.versions[lang].text) === t);
  if (sheet) return sheet.sourceId;
  const rev = studio.repo.listRevisions({ language: lang }).find((r) => OPEN.includes(r.state) && r.sourceId !== exceptSourceId && norm(r.proposedText) === t);
  return rev ? rev.sourceId : null;
}

export function newCopyId(studio: Studio): string {
  let max = 0;
  for (const r of studio.repo.listRevisions()) { const m = /^NEW-(\d+)$/.exec(r.sourceId); if (m) max = Math.max(max, Number(m[1])); }
  return `NEW-${String(max + 1).padStart(3, '0')}`;
}

/** New headline/description (or its translation) in a collection. Kept as a suggestion; never distributed automatically. */
export async function saveNewCopy(studio: Studio, input: { sourceId?: string; collection: string; assetType: string; language: Lang; text: string }, actor: Actor) {
  const wb = await studio.workbook();
  if (input.language === 'EN' || !input.sourceId) {
    if (input.language !== 'EN') throw new StudioError(400, 'Write the English first; translations belong to it.');
    const existing = input.sourceId ? openSuggestion(studio, input.sourceId, 'EN', 'variation') : null;
    if (!input.text.trim()) {
      if (existing) {
        await studio.withdraw(existing.id, actor);
        for (const l of ['DK', 'DE'] as Lang[]) { const t = openSuggestion(studio, existing.sourceId, l, 'variation'); if (t) await studio.withdraw(t.id, actor); }
      }
      return { status: 'removed' as const, revision: null };
    }
    const dup = duplicateOf(studio, wb.library, 'EN', input.text, input.sourceId);
    if (dup) throw new StudioError(409, `Identical copy already exists (${dup}). It was not added again.`);
    if (existing) return { status: 'saved' as const, revision: await studio.editRevision(existing.id, { proposedText: input.text }, actor) };
    const rev = await studio.createRevision({ kind: 'variation', sourceId: input.sourceId || newCopyId(studio), language: 'EN', proposedText: input.text, meta: { assetType: input.assetType, collection: input.collection } }, actor);
    return { status: 'saved' as const, revision: rev };
  }
  // Translation of a new line: linked to that line's English, never to another line's translations.
  const enVar = openSuggestion(studio, input.sourceId, 'EN', 'variation');
  if (!enVar) throw new StudioError(400, 'Write the English first; translations belong to it.');
  const existing = openSuggestion(studio, input.sourceId, input.language, 'variation');
  if (!input.text.trim()) { if (existing) await studio.withdraw(existing.id, actor); return { status: 'removed' as const, revision: null }; }
  const dup = duplicateOf(studio, wb.library, input.language, input.text, input.sourceId);
  if (dup) throw new StudioError(409, `Identical copy already exists (${dup}). It was not added again.`);
  if (existing) return { status: 'saved' as const, revision: await studio.editRevision(existing.id, { proposedText: input.text, englishBasis: enVar.proposedText }, actor) };
  const rev = await studio.createRevision({ kind: 'variation', sourceId: input.sourceId, language: input.language, proposedText: input.text, meta: { assetType: enVar.meta.assetType, collection: enVar.meta.collection } }, actor);
  return { status: 'saved' as const, revision: rev };
}

/** Accept a suggestion: approve its exact wording and, when the connection allows, write it to the Sheet. */
export async function accept(studio: Studio, id: string, actor: Actor) {
  let rev = studio.mustRevision(id);
  if (rev.state === 'written') return { ok: true, message: 'Already in the Sheet.', revision: rev };
  if (rev.state === 'approved') {
    if (rev.kind !== 'replace') return { ok: true, message: 'Already accepted.', revision: rev };
    return studio.writeToSheet(id, actor);
  }
  if (rev.kind === 'replace' && rev.language !== 'EN') {
    const item = await studio.item(rev.sourceId);
    if (item && rev.englishBasis !== item.versions.EN.text) {
      const en = openSuggestion(studio, rev.sourceId, 'EN');
      throw new StudioError(409, en
        ? 'This translation follows a suggested English change. Accept the English first, then this translation.'
        : 'The English has changed since this translation was written. Check the translation against the current English, then accept.');
    }
  }
  if (rev.state !== 'submitted') rev = await studio.submit(id, actor);
  return studio.approve(id, actor, { updateSheet: studio.gateway().canWrite });
}

export async function returnForEditing(studio: Studio, id: string, comment: string, actor: Actor) {
  const rev = studio.mustRevision(id);
  if (rev.state === 'draft') {
    // Drafts can be returned too: record the note and mark as returned.
    await studio.submit(id, actor);
  }
  return studio.requestChanges(id, comment, actor);
}

/** Conflict: the Sheet changed after the suggestion was made. Keep the suggestion, now against the current Sheet wording. */
export async function keepAgainstCurrent(studio: Studio, id: string, actor: Actor) {
  const rev = studio.mustRevision(id);
  if (rev.kind !== 'replace') throw new StudioError(400, 'Only edits of existing lines can conflict with the Sheet.');
  if (rev.state === 'written') throw new StudioError(409, 'Already written.');
  const r = await studio.refresh();
  if (!r.ok) throw new StudioError(503, `Could not read the Sheet: ${r.error?.message}`);
  const item = await studio.item(rev.sourceId);
  if (!item) throw new StudioError(404, 'Line not found in the Sheet.');
  const now = item.versions[rev.language].text;
  studio.repo.revokeApprovals({ revisionId: id }, 'Rebased onto newer Sheet wording');
  const { fp } = await import('./library');
  studio.repo.updateRevision(id, { baseText: now, baseFp: fp(now), state: 'draft', syncState: 'none', syncDetail: '' });
  studio.repo.addEvent(id, `${actor.name || 'Local user'}`, 'kept_against_current_sheet', rev.state, 'draft', { previousBase: rev.baseText, newBase: now });
  if (now === rev.proposedText) await studio.withdraw(id, actor);
  return studio.mustRevision(id);
}

export { newId };
