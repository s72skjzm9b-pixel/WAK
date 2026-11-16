// Direct editing and the suggestion lifecycle:
//   Draft (autosaved) → Ready for review (deliberate) → Approved locally → Written to Sheet → Applied (history)
// Nothing here writes to the Sheet; only approve() can, through the conflict-checked write path, and live
// writes are switched off in this version (config.liveWritesEnabled).
import type { Lang } from '../workbook/types';
import { Studio, StudioError, CANONICAL_LANGS, type Actor } from './studio';
import type { Revision } from '../store/repo';
import { fp } from './library';

const OPEN = ['draft', 'submitted', 'changes_requested', 'approved'];
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const ADDABLE_FIELDS = ['Headline', 'Long headline', 'Description'] as const;

export function openSuggestion(studio: Studio, sourceId: string, lang: string, kind: 'replace' | 'variation' = 'replace'): Revision | null {
  return studio.repo.listRevisions({ sourceId, language: lang as Lang }).find((r) => r.kind === kind && OPEN.includes(r.state)) ?? null;
}

/** The English a translation of this line should be checked against: the suggested English if there is one. */
export async function effectiveEnglish(studio: Studio, sourceId: string): Promise<{ text: string; revisionId: string | null }> {
  const en = openSuggestion(studio, sourceId, 'EN', 'replace') ?? openSuggestion(studio, sourceId, 'EN', 'variation');
  if (en) return { text: en.proposedText, revisionId: en.id };
  const item = await studio.item(sourceId);
  return { text: item?.versions.EN.text ?? '', revisionId: null };
}

/** Autosave of an existing Sheet line in one language. Same text as the Sheet = revert (draft discarded). */
export async function saveEdit(studio: Studio, input: { sourceId: string; language: string; text: string }, actor: Actor) {
  const item = await studio.item(input.sourceId);
  if (!item) throw new StudioError(404, 'This line is no longer in the Sheet. Refresh to see the current copy.');
  const sheetText = (item.versions as Record<string, { text: string }>)[input.language]?.text ?? '';
  const open = openSuggestion(studio, input.sourceId, input.language);
  if (input.text === sheetText) {
    if (open) await studio.withdraw(open.id, actor);
    return { status: 'reverted' as const, revision: null };
  }
  const en = input.language === 'EN' ? null : await effectiveEnglish(studio, input.sourceId);
  let rev: Revision;
  if (open) rev = await studio.editRevision(open.id, { proposedText: input.text, ...(en ? { englishBasis: en.text } : {}) }, actor);
  else rev = await studio.createRevision({ kind: 'replace', sourceId: input.sourceId, language: input.language as Lang, proposedText: input.text, basedOnRevisionId: en?.revisionId ?? null }, actor);
  return { status: 'saved' as const, revision: rev };
}

function duplicateOf(studio: Studio, lib: Awaited<ReturnType<Studio['workbook']>>['library'], lang: string, text: string, exceptSourceId?: string): string | null {
  const t = norm(text);
  if (!t) return null;
  const sheet = lib.find((i) => i.sourceId !== exceptSourceId && norm((i.versions as Record<string, { text: string }>)[lang]?.text ?? '') === t);
  if (sheet) return sheet.sourceId;
  const rev = studio.repo.listRevisions({ language: lang as Lang }).find((r) => OPEN.includes(r.state) && r.sourceId !== exceptSourceId && norm(r.proposedText) === t);
  return rev ? rev.sourceId : null;
}

export function newCopyId(studio: Studio): string {
  let max = 0;
  for (const r of studio.repo.listRevisions()) { const m = /^NEW-(\d+)$/.exec(r.sourceId); if (m) max = Math.max(max, Number(m[1])); }
  return `NEW-${String(max + 1).padStart(3, '0')}`;
}

/** New headline / long headline / description (or a translation of one). Its home collection is where it is
 *  organised; it is NOT used anywhere until intended uses are chosen. */
export async function saveNewCopy(studio: Studio, input: { sourceId?: string; collection: string; assetType: string; language: string; text: string; linkedHeadlineId?: string | null; separatedFrom?: string | null }, actor: Actor) {
  const wb = await studio.workbook();
  if (input.language === 'EN' || !input.sourceId) {
    if (input.language !== 'EN') throw new StudioError(400, 'Write the English first; translations belong to it.');
    if (!input.sourceId && !(ADDABLE_FIELDS as readonly string[]).includes(input.assetType)) throw new StudioError(400, `“${input.assetType}” is not a Google Ads text field. Use Headline, Long headline or Description.`);
    const existing = input.sourceId ? openSuggestion(studio, input.sourceId, 'EN', 'variation') : null;
    if (!input.text.trim()) {
      if (existing) {
        await studio.withdraw(existing.id, actor);
        for (const r of studio.repo.listRevisions({ sourceId: existing.sourceId }).filter((x) => x.kind === 'variation' && x.language !== 'EN' && OPEN.includes(x.state))) await studio.withdraw(r.id, actor);
      }
      return { status: 'removed' as const, revision: null };
    }
    const dup = duplicateOf(studio, wb.library, 'EN', input.text, input.sourceId);
    if (dup) throw new StudioError(409, `This wording already exists, so it was not added again.`);
    if (existing) return { status: 'saved' as const, revision: await studio.editRevision(existing.id, { proposedText: input.text }, actor) };
    const rev = await studio.createRevision({ kind: 'variation', sourceId: input.sourceId || newCopyId(studio), language: 'EN', proposedText: input.text,
      meta: { assetType: input.assetType, collection: input.collection, linkedHeadlineId: input.linkedHeadlineId ?? null, separatedFrom: input.separatedFrom ?? null } }, actor);
    return { status: 'saved' as const, revision: rev };
  }
  // Translation of a new line: linked to that line's English, never to another line's translations.
  const enVar = openSuggestion(studio, input.sourceId, 'EN', 'variation') ?? studio.repo.listRevisions({ sourceId: input.sourceId, language: 'EN' }).find((r) => r.kind === 'variation' && r.state === 'written') ?? null;
  if (!enVar) throw new StudioError(400, 'Write the English first; translations belong to it.');
  const existing = openSuggestion(studio, input.sourceId, input.language, 'variation');
  if (!input.text.trim()) { if (existing) await studio.withdraw(existing.id, actor); return { status: 'removed' as const, revision: null }; }
  const dup = duplicateOf(studio, wb.library, input.language, input.text, input.sourceId);
  if (dup) throw new StudioError(409, `This wording already exists, so it was not added again.`);
  if (existing) return { status: 'saved' as const, revision: await studio.editRevision(existing.id, { proposedText: input.text, englishBasis: enVar.proposedText }, actor) };
  const rev = await studio.createRevision({ kind: 'variation', sourceId: input.sourceId, language: input.language as Lang, proposedText: input.text, meta: { assetType: enVar.meta.assetType, collection: enVar.meta.collection, linkedHeadlineId: enVar.meta.linkedHeadlineId ?? null } }, actor);
  return { status: 'saved' as const, revision: rev };
}

/** Deliberate step: the draft is finished and may be reviewed. */
export async function markReady(studio: Studio, id: string, actor: Actor) {
  const rev = studio.mustRevision(id);
  if (rev.state === 'submitted') return rev;
  if (!['draft', 'changes_requested'].includes(rev.state)) throw new StudioError(409, 'Only drafts can be marked ready for review.');
  if (rev.kind !== 'retire' && !rev.proposedText.trim()) throw new StudioError(400, 'The wording is empty.');
  return studio.submit(id, actor);
}

/** Back to draft without losing anything (e.g. “not finished after all”). */
export async function backToDraft(studio: Studio, id: string, actor: Actor) {
  const rev = studio.mustRevision(id);
  if (rev.state !== 'submitted') throw new StudioError(409, 'Only items that are ready for review can go back to draft.');
  studio.repo.updateRevision(id, { state: 'draft', readyAt: null });
  studio.repo.addEvent(id, actor.name || 'Local user', 'back_to_draft', 'submitted', 'draft');
  return studio.mustRevision(id);
}

export type ApproveOutcome = 'approved_locally' | 'accepted_practice' | 'written' | 'live_writes_off';

/** What “approve” means in the current mode — used for button labels and messages. */
export function approveMeaning(studio: Studio, rev?: Pick<Revision, 'kind' | 'language'>) {
  const mode = studio.mode();
  const canonical = !rev || (rev.kind === 'replace' && CANONICAL_LANGS.includes(rev.language));
  if (rev && rev.kind === 'variation') return { label: 'Approve new copy locally', note: 'New copy is registered in the Sheet by hand for now.' };
  if (!canonical) return { label: 'Approve locally', note: 'This language has no column in the master Sheet yet — it stays local.' };
  if (mode === 'snapshot') return { label: 'Approve locally', note: 'Snapshot mode: approval is saved on this computer. The Sheet is not changed.' };
  if (mode === 'sandbox') return { label: 'Accept into practice copy', note: 'Practice mode: writes to the local practice copy only.' };
  if (!studio.gateway().canWrite) return { label: 'Approve locally', note: 'Live Sheet writes are switched off in this version. Approval is saved locally.' };
  return { label: 'Approve and update Sheet', note: 'Writes the exact wording to the live Sheet after a fresh comparison, then reads it back.' };
}

/** Approve a Ready-for-review item. Drafts can never be approved directly. */
export async function accept(studio: Studio, id: string, actor: Actor) {
  const rev = studio.mustRevision(id);
  if (rev.state === 'written') return { ok: true, message: 'Already in the Sheet.', revision: rev };
  if (rev.state === 'approved') {
    if (rev.kind !== 'replace' || !CANONICAL_LANGS.includes(rev.language)) return { ok: true, message: 'Already approved.', revision: rev };
    return studio.writeToSheet(id, actor);
  }
  if (rev.state !== 'submitted') throw new StudioError(409, 'This is still a draft. Mark it “Ready for review” first.');
  const item = await studio.item(rev.sourceId);
  studio.assertEnglishReady(rev, item);
  const res = await studio.approve(id, actor, { updateSheet: studio.gateway().canWrite });
  const meaning = approveMeaning(studio, rev);
  if (res.ok && res.revision.state === 'approved' && rev.kind === 'replace' && CANONICAL_LANGS.includes(rev.language)) {
    return { ...res, message: studio.mode() === 'snapshot' ? 'Approved locally. The Sheet is not changed in Snapshot mode.' : meaning.note };
  }
  return res;
}

export async function returnForEditing(studio: Studio, id: string, comment: string, actor: Actor) {
  const rev = studio.mustRevision(id);
  if (rev.state === 'draft') await studio.submit(id, actor);
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
  const now = (item.versions as Record<string, { text: string }>)[rev.language]?.text ?? '';
  studio.repo.revokeApprovals({ revisionId: id }, 'Rebased onto newer Sheet wording');
  studio.repo.updateRevision(id, { baseText: now, baseFp: fp(now), state: 'draft', syncState: 'none', syncDetail: '', readyAt: null });
  studio.repo.addEvent(id, actor.name || 'Local user', 'kept_against_current_sheet', rev.state, 'draft', { previousBase: rev.baseText, newBase: now });
  if (now === rev.proposedText) await studio.withdraw(id, actor);
  return studio.mustRevision(id);
}

/** “Make a separate version here”: a new line with its own identity in this collection, starting from the
 *  shared wording. It has empty translations — the shared line's translations belong to the shared line. */
export async function separateVersion(studio: Studio, input: { sourceId: string; collection: string; text?: string }, actor: Actor) {
  const item = await studio.item(input.sourceId);
  if (!item) throw new StudioError(404, 'Line not found.');
  const text = input.text ?? item.versions.EN.text;
  const field = (ADDABLE_FIELDS as readonly string[]).includes(item.assetType) ? item.assetType : 'Headline';
  const rev = await studio.createRevision({ kind: 'variation', sourceId: newCopyId(studio), language: 'EN', proposedText: text,
    meta: { assetType: field, collection: input.collection, separatedFrom: input.sourceId, linkedHeadlineId: item.linkedHeadlineId } }, actor);
  studio.repo.addIntendedUse({ sourceId: rev.sourceId, collection: input.collection, field, format: null, campaign: null, group: null, createdBy: actor.name || 'Local user' });
  return rev;
}

/** “Use in collection…” for an idea: either an independent copy or a deliberate link to the source. */
export async function useIdea(studio: Studio, input: { sourceId: string; collection: string; field: string; mode: 'copy' | 'link'; format?: string | null }, actor: Actor) {
  if (!(ADDABLE_FIELDS as readonly string[]).includes(input.field)) throw new StudioError(400, 'Choose Headline, Long headline or Description.');
  const item = await studio.item(input.sourceId);
  if (!item) throw new StudioError(404, 'Idea not found.');
  if (input.mode === 'link') {
    studio.repo.addIntendedUse({ sourceId: input.sourceId, collection: input.collection, field: input.field, format: input.format ?? null, campaign: null, group: null, createdBy: actor.name || 'Local user' });
    return { linked: true, sourceId: input.sourceId };
  }
  const rev = await studio.createRevision({ kind: 'variation', sourceId: newCopyId(studio), language: 'EN', proposedText: item.versions.EN.text,
    meta: { assetType: input.field, collection: input.collection, separatedFrom: input.sourceId } }, actor);
  if (input.format) studio.repo.addIntendedUse({ sourceId: rev.sourceId, collection: input.collection, field: input.field, format: input.format, campaign: null, group: null, createdBy: actor.name || 'Local user' });
  return { linked: false, sourceId: rev.sourceId };
}
