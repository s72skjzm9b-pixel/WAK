// Application service: the only place that combines the Sheet gateway, the local store and the domain
// rules. Route handlers call these methods; they never touch SQL or Google directly.
import type { Lang, ParsedWorkbook, RawWorkbook } from '../workbook/types';
import { parseWorkbook } from '../workbook/parse';
import { buildLibrary, fp, isTestId, type CopyItem } from './library';
import { planAdvanceReference, planReplacement, updatesBound, type WritePlan } from './writeplan';
import { validateText, type Validation } from '@/lib/limits';
import { UPDATES_FILTER_LAST_ROW } from '../workbook/formulas';
import { describeError, SheetError, type GatewayMode, type SheetGateway } from '../sheets/gateway';
import { Repo, newId, now, type Approval, type Revision, type RevisionKind, type RevisionMeta, type FeedbackRow } from '../store/repo';
import { buildCollections } from './collections';

export const CANONICAL_LANGS = ['EN', 'DK', 'DE'];

export interface Actor { role: string; name: string; email?: string }
const who = (a: Actor) => `${a.name || 'Unnamed'} (${a.role})`;

export class StudioError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface WorkbookState { parsed: ParsedWorkbook; library: CopyItem[]; readId: number; readAt: string; origin: RawWorkbook['origin'] }

export type ApprovalCheck =
  | { valid: true; approval: Approval }
  | { valid: false; approval: Approval | null; reason: string };

export class Studio {
  private cache: { mode: GatewayMode; readId: number; state: WorkbookState } | null = null;
  private inFlight = new Set<string>();

  constructor(public repo: Repo, private gateways: Partial<Record<GatewayMode, () => SheetGateway>>, private defaultMode: GatewayMode) {}

  // ------------------------------------------------------------------ connection
  private modeCache: GatewayMode | null = null;
  /** Load persisted settings once (call before use). */
  async init() {
    const m = (await this.repo.getSetting('mode')) as GatewayMode | null;
    this.modeCache = m && this.gateways[m] ? m : this.defaultMode;
    return this;
  }
  mode(): GatewayMode {
    return this.modeCache && this.gateways[this.modeCache] ? this.modeCache : this.defaultMode;
  }
  async setMode(m: GatewayMode) {
    if (!this.gateways[m]) throw new StudioError(400, `Mode ${m} is not available.`);
    await this.repo.setSetting('mode', m);
    this.modeCache = m;
    this.cache = null;
  }
  /** Switching to the live Sheet is only allowed once a real read succeeds. */
  async switchMode(m: GatewayMode) {
    if (!this.gateways[m]) throw new StudioError(400, `Mode ${m} is not available.`);
    if (m === 'google') {
      try { await this.gateways.google!().readWorkbook(); }
      catch (e) { throw new StudioError(409, `The live Sheet isn’t connected yet: ${describeError(e).message}`); }
    }
    await this.setMode(m);
    return this.refresh();
  }
  /** Can a read of the live Sheet succeed right now? (Used to enable the Live option.) */
  async liveReadable(): Promise<{ ok: boolean; message: string }> {
    if (!this.gateways.google) return { ok: false, message: 'Not available.' };
    try { await this.gateways.google().readWorkbook(); return { ok: true, message: 'The live Sheet can be read.' }; }
    catch (e) { return { ok: false, message: describeError(e).message }; }
  }
  gateway(): SheetGateway {
    const g = this.gateways[this.mode()];
    if (!g) throw new StudioError(500, 'No gateway configured');
    return g();
  }

  async refresh(): Promise<{ ok: boolean; error?: ReturnType<typeof describeError>; readId?: number }> {
    const mode = this.mode();
    const id = (await this.repo.startRead(mode));
    try {
      const raw = await this.gateway().readWorkbook();
      const json = JSON.stringify(raw);
      (await this.repo.finishRead(id, true, { raw: json, fingerprint: fp(JSON.stringify(raw.tabs)) }));
      this.cache = null;
      return { ok: true, readId: id };
    } catch (e) {
      const d = describeError(e);
      (await this.repo.finishRead(id, false, { errorKind: d.kind, errorMessage: d.message }));
      return { ok: false, error: d };
    }
  }

  /** The most recent successful read for the current mode (reads once if there is none yet). */
  async workbook(): Promise<WorkbookState> {
    const mode = this.mode();
    let last = (await this.repo.lastGoodRead(mode));
    if (!last) {
      const r = await this.refresh();
      if (r.ok) last = (await this.repo.lastGoodRead(mode))!;
      else {
        // The Sheet can't be reached (e.g. not signed in or offline). Keep working from the last copy
        // that could be read — the live Sheet's own last read, otherwise the dated snapshot. Writes still
        // re-read the real Sheet first, so nothing is written on the basis of this fallback.
        last = (await this.repo.lastGoodRead('google')) ?? (await this.repo.lastGoodRead('snapshot'));
        if (!last && this.gateways.snapshot) {
          const id = (await this.repo.startRead('snapshot'));
          const raw = await this.gateways.snapshot().readWorkbook();
          (await this.repo.finishRead(id, true, { raw: JSON.stringify(raw), fingerprint: fp(JSON.stringify(raw.tabs)) }));
          last = (await this.repo.lastGoodRead('snapshot'));
        }
        if (!last) throw new StudioError(503, `Could not read the workbook: ${r.error?.message}`);
      }
    }
    if (this.cache && this.cache.mode === mode && this.cache.readId === last.id) return this.cache.state;
    const raw: RawWorkbook = JSON.parse(last.raw);
    const parsed = parseWorkbook(raw);
    const state = { parsed, library: buildLibrary(parsed), readId: last.id, readAt: raw.readAt, origin: raw.origin };
    this.cache = { mode, readId: last.id, state };
    return state;
  }

  async item(sourceId: string): Promise<CopyItem | null> {
    return (await this.workbook()).library.find((i) => i.sourceId === sourceId) ?? null;
  }

  // ------------------------------------------------------------------ approvals
  private englishNow(item: CopyItem | null): string { return item?.versions.EN.text ?? ''; }

  /** Is this revision's approval still valid for its exact wording and English basis? */
  async checkRevisionApproval(rev: Revision, item: CopyItem | null): Promise<ApprovalCheck> {
    const approvals = (await this.repo.approvalsForRevision(rev.id));
    const a = approvals.find((x) => !x.revokedAt) ?? null;
    if (!a) return { valid: false, approval: approvals[0] ?? null, reason: approvals[0]?.revokedReason ?? 'Not approved' };
    if (a.textFp !== fp(rev.proposedText)) return { valid: false, approval: a, reason: 'Wording changed after approval' };
    if (rev.language !== 'EN') {
      // A translation approval covers its wording AND the English it translates.
      // Replacements: that English must be the Sheet's current English. Variations: the linked English variation.
      const englishRef = rev.kind === 'variation'
        ? ((await this.repo.listRevisions({ sourceId: rev.sourceId, language: 'EN' })).find((r) => r.kind === 'variation' && !['withdrawn', 'superseded'].includes(r.state))?.proposedText ?? rev.englishBasis)
        : this.englishNow(item);
      if (a.englishFp !== fp(englishRef)) return { valid: false, approval: a, reason: 'The English source changed after this translation was approved' };
    }
    return { valid: true, approval: a };
  }

  /** Is the CURRENT Sheet wording of an item approved (as is, or via a written revision)? */
  async currentWordingApproval(item: CopyItem, lang: Lang): Promise<Approval | null> {
    const text = item.versions[lang].text;
    if (!text) return null;
    const en = item.versions.EN.text;
    return (await this.repo.approvalsFor(item.sourceId, lang)).find((a) => !a.revokedAt && a.textFp === fp(text) && (lang === 'EN' || a.englishFp === fp(en))) ?? null;
  }

  validationsFor(text: string, item: CopyItem | null, meta: RevisionMeta): Validation[] {
    const assetType = meta.assetType || item?.assetType || '';
    const formats = item ? item.usages.map((u) => u.format) : [];
    if (meta.collection && this.cache) {
      const col = buildCollections(this.cache.state.parsed, this.cache.state.library).find((c) => c.key === meta.collection);
      for (const g of col?.groups ?? []) formats.push(g.format);
    }
    for (const t of meta.targets ?? []) if (/_SNO_/.test(t.campaign)) formats.push('search'); else if (/_PMX_/.test(t.campaign)) formats.push('pmax'); else if (/_DG_/.test(t.campaign)) formats.push('demand_gen');
    return validateText(text, assetType, formats);
  }

  // ------------------------------------------------------------------ revisions
  async createRevision(input: { kind: RevisionKind; sourceId?: string; language: Lang; proposedText: string; reason?: string; meta?: RevisionMeta; basedOnRevisionId?: string | null }, actor: Actor): Promise<Revision> {
    const wb = await this.workbook();
    const meta: RevisionMeta = { ...(input.meta ?? {}) };
    let sourceId = input.sourceId?.trim() ?? '';
    let baseText = '', englishBasis = '';
    const item = sourceId ? wb.library.find((i) => i.sourceId === sourceId) ?? null : null;

    if (input.kind === 'replace' || input.kind === 'retire') {
      if (!item) throw new StudioError(404, `Source ID ${sourceId} is not in the current Sheet read.`);
      baseText = item.versions[input.language]?.text ?? '';
      if (input.kind === 'replace' && input.language !== 'EN' && !baseText) {
        // Translating a line that has no translation yet is still a replacement of a blank cell.
      }
      englishBasis = input.language === 'EN' ? input.proposedText : item.versions.EN.text;
      meta.assetType ??= item.assetType; meta.theme ??= item.theme; meta.intent ??= item.intent; meta.linkedHeadline ??= item.linkedHeadline;
    } else {
      // New variation: never replaces anything; gets a proposed ID that is not yet in the Sheet.
      if (!sourceId) sourceId = (await this.suggestNewId(wb.library));
      if (wb.library.some((i) => i.sourceId === sourceId) && input.language === 'EN') {
        throw new StudioError(409, `${sourceId} already exists in the Sheet. A new variation needs a new ID.`);
      }
      if (input.language === 'EN') englishBasis = input.proposedText;
      else {
        const enVar = (await this.repo.listRevisions({ sourceId, language: 'EN' })).find((r) => r.kind === 'variation' && r.state !== 'withdrawn');
        if (!enVar) throw new StudioError(400, 'Add the English variation first; translations are linked to it.');
        englishBasis = enVar.proposedText;
      }
    }
    if (input.basedOnRevisionId) {
      const enRev = (await this.repo.getRevision(input.basedOnRevisionId));
      if (!enRev || enRev.language !== 'EN' || enRev.sourceId !== sourceId) throw new StudioError(400, 'The English proposal to translate from was not found.');
      englishBasis = enRev.proposedText; meta.basedOnRevisionId = enRev.id;
    }
    const isTest = isTestId(sourceId);
    const rev: Revision = {
      id: newId('rev'), kind: input.kind, sourceId, language: input.language, baseText, baseFp: fp(baseText), baseReadId: wb.readId,
      proposedText: input.kind === 'retire' ? '' : input.proposedText, englishBasis: input.kind === 'retire' ? '' : englishBasis,
      englishBasisFp: fp(input.kind === 'retire' ? '' : englishBasis), reason: input.reason ?? '', meta, state: 'draft', syncState: 'none',
      syncDetail: '', isTest, createdBy: who(actor), createdAt: now(), updatedAt: now(), readyAt: null, appliedAt: null, appliedBy: null, archivedAt: null,
    };
    await this.repo.tx(async () => {
      (await this.repo.insertRevision(rev));
      (await this.repo.addEvent(rev.id, who(actor), 'created', null, 'draft', { kind: rev.kind, baseText, proposedText: rev.proposedText, baseReadId: wb.readId }));
    });
    return rev;
  }

  async suggestNewId(library: CopyItem[]): Promise<string> {
    const used = new Set([...library.map((i) => i.sourceId), ...(await this.repo.listRevisions()).map((r) => r.sourceId)]);
    let max = 0;
    for (const id of used) { const m = /^G(\d+)$/.exec(id); if (m) max = Math.max(max, Number(m[1])); }
    return `G${String(max + 1).padStart(2, '0')}`;
  }

  /** Typing/saving: local only. Any edit to approved wording invalidates the approval. */
  async editRevision(id: string, patch: { proposedText?: string; reason?: string; meta?: RevisionMeta; basedOnRevisionId?: string | null; englishBasis?: string }, actor: Actor): Promise<Revision> {
    const rev = (await this.mustRevision(id));
    if (rev.state === 'written') throw new StudioError(409, 'This wording has been written to the Sheet. Start a new proposal to change it again.');
    if (rev.state === 'withdrawn' || rev.state === 'superseded') throw new StudioError(409, `This proposal is ${rev.state}.`);
    const textChanged = patch.proposedText !== undefined && patch.proposedText !== rev.proposedText;
    const next: Partial<Revision> = {};
    if (patch.reason !== undefined) next.reason = patch.reason;
    if (patch.meta) next.meta = { ...rev.meta, ...patch.meta };
    if (patch.englishBasis !== undefined && rev.language !== 'EN' && patch.englishBasis !== rev.englishBasis) {
      next.englishBasis = patch.englishBasis; next.englishBasisFp = fp(patch.englishBasis);
    }
    if (textChanged) {
      next.proposedText = patch.proposedText!;
      if (rev.language === 'EN') { next.englishBasis = patch.proposedText!; next.englishBasisFp = fp(patch.proposedText!); }
    }
    await this.repo.tx(async () => {
      if (textChanged && rev.state !== 'draft') {
        const revoked = (await this.repo.revokeApprovals({ revisionId: id }, 'Wording edited after approval'));
        next.state = 'draft'; next.syncState = 'none'; next.syncDetail = '';
        (await this.repo.addEvent(id, who(actor), revoked ? 'approval_invalidated' : 'returned_to_draft', rev.state, 'draft', { reason: 'Wording edited', previousText: rev.proposedText, newText: patch.proposedText }));
      }
      if (next.state === 'draft') next.readyAt = null;
      (await this.repo.updateRevision(id, next));
      if (textChanged) (await this.repo.addEvent(id, who(actor), 'edited', null, null, { from: rev.proposedText, to: patch.proposedText }));
      // English edits: translation proposals for the same line need re-review.
      if (textChanged && rev.language === 'EN') (await this.flagTranslations(rev.sourceId, actor, 'English proposal edited', patch.proposedText));
    });
    return (await this.mustRevision(id));
  }

  private async flagTranslations(sourceId: string, actor: Actor, why: string, newEnglish?: string) {
    for (const t of (await this.repo.listRevisions({ sourceId })).filter((r) => r.language !== 'EN' && ['submitted', 'approved'].includes(r.state))) {
      if (newEnglish !== undefined && t.englishBasis === newEnglish) continue; // already written against this English
      const revoked = (await this.repo.revokeApprovals({ revisionId: t.id }, `English changed: ${why}`));
      (await this.repo.updateRevision(t.id, { state: 'changes_requested', syncDetail: 'English changed — re-review this translation.' }));
      (await this.repo.addEvent(t.id, who(actor), 'translation_flagged', t.state, 'changes_requested', { why, approvalRevoked: !!revoked }));
    }
  }

  async submit(id: string, actor: Actor) {
    const rev = (await this.mustRevision(id));
    if (!['draft', 'changes_requested'].includes(rev.state)) throw new StudioError(409, `Cannot submit a proposal that is ${rev.state}.`);
    if (rev.kind !== 'retire' && !rev.proposedText.trim()) throw new StudioError(400, 'Wording is empty.');
    (await this.transition(rev, 'submitted', actor, 'ready_for_review'));
    (await this.repo.updateRevision(id, { readyAt: now() }));
    return (await this.mustRevision(id));
  }

  async requestChanges(id: string, comment: string, actor: Actor) {
    const rev = (await this.mustRevision(id));
    if (!['submitted', 'approved'].includes(rev.state)) throw new StudioError(409, `Cannot request changes on a proposal that is ${rev.state}.`);
    await this.repo.tx(async () => {
      (await this.repo.revokeApprovals({ revisionId: id }, 'Changes requested'));
      (await this.repo.updateRevision(id, { state: 'changes_requested', syncState: 'none' }));
      (await this.repo.addEvent(id, who(actor), 'changes_requested', rev.state, 'changes_requested', { comment }));
    });
    return (await this.mustRevision(id));
  }

  async withdraw(id: string, actor: Actor) {
    const rev = (await this.mustRevision(id));
    if (rev.state === 'written') throw new StudioError(409, 'Already written to the Sheet; propose a new change instead.');
    await this.repo.tx(async () => {
      (await this.repo.revokeApprovals({ revisionId: id }, 'Withdrawn'));
      (await this.repo.updateRevision(id, { state: 'withdrawn' }));
      (await this.repo.addEvent(id, who(actor), 'withdrawn', rev.state, 'withdrawn'));
    });
    return (await this.mustRevision(id));
  }

  private async transition(rev: Revision, to: Revision['state'], actor: Actor, action: string, detail: object = {}) {
    await this.repo.tx(async () => {
      (await this.repo.updateRevision(rev.id, { state: to }));
      (await this.repo.addEvent(rev.id, who(actor), action, rev.state, to, detail));
    });
  }

  async mustRevision(id: string): Promise<Revision> {
    const r = (await this.repo.getRevision(id));
    if (!r) throw new StudioError(404, 'Proposal not found');
    return r;
  }

  /** Everything the approval screen shows. */
  async approvalView(id: string) {
    const rev = (await this.mustRevision(id));
    const wb = await this.workbook();
    const item = wb.library.find((i) => i.sourceId === rev.sourceId) ?? null;
    // Once written, show the plan that was actually executed rather than re-planning against the updated Sheet.
    const executed = rev.state === 'written' ? (await this.repo.attempts({ revisionId: id })).find((a) => a.status === 'succeeded' || a.status === 'already_applied') : null;
    const plan: WritePlan | null = executed ? { ...executed.plan, blockers: [], warnings: [] } : rev.kind === 'replace' && rev.state !== 'written'
      ? planReplacement(wb.parsed, { sourceId: rev.sourceId, language: rev.language, baseText: rev.baseText, proposedText: rev.proposedText, englishBasis: rev.englishBasis })
      : null;
    const translationImpact = rev.language === 'EN' && item
      ? await Promise.all((['DK', 'DE'] as Lang[]).map(async (l) => ({
          lang: l, text: item.versions[l].text,
          openProposals: (await this.repo.listRevisions({ sourceId: rev.sourceId, language: l })).filter((r) => !['withdrawn', 'superseded', 'written'].includes(r.state)).length,
          effect: item.versions[l].text ? 'Will be flagged “Recheck translation” in the Sheet and listed in Updates for Anabelle until re-approved.' : 'Not yet translated.',
        })))
      : [];
    return {
      revision: rev,
      events: (await this.repo.events(id)),
      approval: (await this.checkRevisionApproval(rev, item)),
      item,
      sheetNow: item ? item.versions[rev.language].text : null,
      validations: this.validationsFor(rev.proposedText, item, rev.meta),
      plan,
      planIsHistorical: !!executed,
      translationImpact,
      canWrite: this.gateway().canWrite,
      mode: this.mode(),
      attempts: (await this.repo.attempts({ revisionId: id })),
      readAt: wb.readAt,
    };
  }

  /** Translations may only be approved against English that is itself approved (and unchanged since). */
  async assertEnglishReady(rev: Revision, item: CopyItem | null) {
    if (rev.language === 'EN' || rev.kind === 'retire') return;
    if (rev.kind === 'variation') {
      const en = (await this.repo.listRevisions({ sourceId: rev.sourceId, language: 'EN' })).find((r) => r.kind === 'variation' && !['withdrawn', 'superseded'].includes(r.state));
      if (!en || !['approved', 'written'].includes(en.state)) throw new StudioError(409, 'Approve the English of this new line first; its translations follow it.');
      if (en.proposedText !== rev.englishBasis) throw new StudioError(409, 'The English changed after this translation was written. Check the translation against the current English first.');
      return;
    }
    const openEn = (await this.repo.listRevisions({ sourceId: rev.sourceId, language: 'EN' })).find((r) => r.kind === 'replace' && ['draft', 'submitted', 'changes_requested', 'approved'].includes(r.state));
    if (openEn) throw new StudioError(409, 'The English of this line is being changed. Approve the English first, then check this translation against it.');
    if (item && rev.englishBasis !== item.versions.EN.text) throw new StudioError(409, 'The English changed after this translation was written. Check the translation against the current English first.');
  }

  /** Anabelle (or whoever applies changes) confirms it is done. Moves the item to history. For written
   *  replacements this also advances the Sheet's saved reference so the row leaves “Updates for Anabelle”. */
  async markApplied(id: string, actor: Actor) {
    const rev = (await this.mustRevision(id));
    if (rev.appliedAt) return { ok: true, message: 'Already done.' };
    let message = 'Marked as done.';
    if (rev.kind === 'replace' && rev.state === 'written' && CANONICAL_LANGS.includes(rev.language)) {
      const ack = await this.acknowledge({ revisionId: id, sourceId: rev.sourceId, language: rev.language, appliedText: rev.proposedText }, actor);
      if (this.gateway().canWrite) {
        const r = await this.advanceReference(ack.id, actor);
        if (!r.ok) return { ok: false, message: `Recorded as applied, but the Sheet’s comparison could not be cleared: ${r.message}` };
        message = 'Marked as applied. It is cleared from “Updates for Anabelle”.';
      } else message = 'Marked as applied. (The Sheet’s comparison will be cleared when connected.)';
    } else if (!['approved', 'written'].includes(rev.state)) throw new StudioError(409, 'Only approved changes can be marked as applied or registered.');
    (await this.repo.updateRevision(id, { appliedAt: now(), appliedBy: who(actor) }));
    (await this.repo.addEvent(id, who(actor), rev.kind === 'variation' ? 'registered' : 'applied', rev.state, rev.state, { note: 'Confirmed by a person; not verified against Google Ads.' }));
    return { ok: true, message };
  }

  /** Approve the exact wording. For replacements of existing lines, optionally update the Sheet in the same explicit action. */
  async approve(id: string, actor: Actor, opts: { updateSheet: boolean; note?: string }) {
    const rev = (await this.mustRevision(id));
    if (rev.state !== 'submitted') throw new StudioError(409, `Only submitted proposals can be approved (this one is ${rev.state}).`);
    const item = await this.item(rev.sourceId);
    if (rev.kind !== 'retire') {
      const errs = this.validationsFor(rev.proposedText, item, rev.meta).filter((v) => v.level === 'error');
      if (errs.length) throw new StudioError(422, `Fix before approving: ${errs.map((e) => e.message).join(' ')}`);
    }
    (await this.assertEnglishReady(rev, item));
    const englishText = rev.kind === 'retire' ? '' : rev.englishBasis;
    const approval: Approval = {
      id: newId('apr'), revisionId: id, sourceId: rev.sourceId, language: rev.language, text: rev.proposedText, textFp: fp(rev.proposedText),
      englishText, englishFp: fp(englishText), approvedBy: who(actor), approvedAt: now(), note: opts.note ?? '', revokedAt: null, revokedReason: null,
    };
    const localOnly = rev.kind !== 'replace' || !CANONICAL_LANGS.includes(rev.language);
    await this.repo.tx(async () => {
      (await this.repo.insertApproval(approval));
      (await this.repo.updateRevision(id, {
        state: 'approved',
        syncState: localOnly ? 'local_only' : 'pending',
        syncDetail: localOnly
          ? (rev.kind === 'variation'
            ? 'Approved locally. New IDs are not written to the Sheet in this release: the Updates for Anabelle FILTER only covers existing Change reference rows, so an appended row would be invisible. Register the ID manually (see README) before campaign use.'
            : rev.kind === 'replace' ? `Approved locally. ${rev.language} has no column in the master Sheet yet, so it stays local only.`
          : 'Retirement approved locally. The line is not deleted from the Sheet; Anabelle removes or pauses the asset in the listed groups.')
          : 'Approved. Sheet not updated yet.',
      }));
      (await this.repo.addEvent(id, who(actor), 'approved', 'submitted', 'approved', { approvalId: approval.id, text: rev.proposedText, englishBasis: englishText, note: opts.note }));
      if (rev.language === 'EN' && rev.kind === 'replace') (await this.flagTranslations(rev.sourceId, actor, 'English wording approved for change', rev.proposedText));
    });
    if (!localOnly && opts.updateSheet) return this.writeToSheet(id, actor);
    return { ok: true, revision: (await this.mustRevision(id)), message: localOnly ? 'Approved (kept local).' : 'Approved. The Sheet has not been updated yet.' };
  }

  /** Writes an approved replacement. Safe to retry: it never writes twice and never overwrites someone else's edit. */
  async writeToSheet(id: string, actor: Actor): Promise<{ ok: boolean; revision: Revision; message: string; outcome?: string }> {
    if (this.inFlight.has(id)) throw new StudioError(409, 'A write for this proposal is already in progress.');
    this.inFlight.add(id);
    try {
      const rev = (await this.mustRevision(id));
      if (rev.kind !== 'replace') throw new StudioError(400, 'Only replacements of existing lines are written to the Sheet in this release.');
      if (rev.state === 'written') return { ok: true, revision: rev, message: 'Already written to the Sheet.', outcome: 'already_written' };
      if (rev.state !== 'approved') throw new StudioError(409, 'Approve the exact wording before updating the Sheet.');
      const gw = this.gateway();
      if (!gw.canWrite) {
        (await this.repo.updateRevision(id, { syncState: 'pending', syncDetail: `Approved — not written: ${gw.describe()} is read-only.` }));
        return { ok: false, revision: (await this.mustRevision(id)), message: `${gw.describe()} is read-only. The approval is kept; update the Sheet once connected.`, outcome: 'read_only' };
      }
      const item0 = await this.item(rev.sourceId);
      const chk = (await this.checkRevisionApproval(rev, item0));
      if (!chk.valid) throw new StudioError(409, `Approval is no longer valid: ${chk.reason}.`);
      const key = `${rev.id}:${chk.approval.id}`;

      // Always plan against a fresh read of the real Sheet.
      const r = await this.refresh();
      if (!r.ok) return (await this.failWrite(rev, actor, key, null, r.error!.kind, `Could not read the Sheet before writing: ${r.error!.message}`));
      const wb = await this.workbook();
      // A previous attempt of THIS approval may have written the text cell but not the approval cells
      // (partial write). Resume it instead of reporting a conflict.
      const priorAttempt = (await this.repo.attempts({ revisionId: id })).some((a) => a.idempotencyKey === key && a.status !== 'conflict');
      const nowText = wb.library.find((i) => i.sourceId === rev.sourceId)?.versions[rev.language].text;
      const resume = priorAttempt && nowText === rev.proposedText && rev.proposedText !== rev.baseText;
      const plan = planReplacement(wb.parsed, { sourceId: rev.sourceId, language: rev.language, baseText: rev.baseText, proposedText: rev.proposedText, englishBasis: rev.englishBasis, resume });

      // Retry after a lost response: the Sheet already holds exactly what we meant to write.
      const target = plan.cells[0];
      if (target) {
        const reads = await gw.readCells(plan.cells.map((c) => c.ref));
        if (reads.every((c, i) => c.value === plan.cells[i].after)) {
          const a = (await this.repo.startAttempt({ revisionId: id, purpose: 'replace', key, mode: gw.mode, plan }));
          (await this.repo.finishAttempt(a, 'already_applied', { verify: { note: 'All planned cells already held the approved values; nothing was written.' } }));
          return (await this.markWritten(rev, actor, 'Already present in the Sheet (an earlier attempt succeeded). Nothing was written twice.', 'already_applied'));
        }
      }
      if (!plan.ok) {
        const conflict = plan.blockers.some((b) => b.startsWith('Conflict') || b.includes('English source has changed'));
        const a = (await this.repo.startAttempt({ revisionId: id, purpose: 'replace', key, mode: gw.mode, plan }));
        (await this.repo.finishAttempt(a, conflict ? 'conflict' : 'failed', { errorKind: conflict ? 'conflict' : 'blocked', errorMessage: plan.blockers.join(' ') }));
        (await this.repo.updateRevision(id, { syncState: conflict ? 'conflict' : 'failed', syncDetail: plan.blockers.join(' ') }));
        (await this.repo.addEvent(id, who(actor), conflict ? 'write_conflict' : 'write_blocked', 'approved', 'approved', { blockers: plan.blockers }));
        return { ok: false, revision: (await this.mustRevision(id)), message: plan.blockers.join(' '), outcome: conflict ? 'conflict' : 'blocked' };
      }

      // Guard cells: never formulas, and still holding the values we planned against.
      const guardRefs = [...new Set([...plan.mustNotBeFormula, ...plan.guards.map((g) => g.ref), ...(plan.updatesFormulaRef ? [plan.updatesFormulaRef] : [])])];
      const cells = await gw.readCells(guardRefs);
      const byRef = new Map(cells.map((c) => [c.ref, c]));
      const problems: string[] = [];
      for (const ref of plan.mustNotBeFormula) if (byRef.get(ref)?.formula) problems.push(`${ref} now holds a formula; refusing to overwrite it.`);
      for (const g of plan.guards) if ((byRef.get(g.ref)?.value ?? '') !== g.equals) problems.push(`Conflict: ${g.why} check failed at ${g.ref}.`);
      if (plan.updatesFormulaRef) {
        const f = byRef.get(plan.updatesFormulaRef)?.formula ?? null;
        const bound = gw.mode === 'google' ? updatesBound(f) : UPDATES_FILTER_LAST_ROW;
        const crRow = plan.cells.find((c) => c.tab === 'Change reference')?.row ?? 0;
        if (bound === null) problems.push('Could not read the Updates for Anabelle formula, so the app cannot confirm Anabelle would see this change.');
        else if (crRow > bound) problems.push(`Change reference row ${crRow} is outside the Updates for Anabelle FILTER range (rows 5–${bound}); Anabelle would not see this change.`);
      }
      if (problems.length) {
        const conflict = problems.some((p) => p.startsWith('Conflict'));
        const a = (await this.repo.startAttempt({ revisionId: id, purpose: 'replace', key, mode: gw.mode, plan }));
        (await this.repo.finishAttempt(a, conflict ? 'conflict' : 'failed', { errorKind: conflict ? 'conflict' : 'blocked', errorMessage: problems.join(' ') }));
        (await this.repo.updateRevision(id, { syncState: conflict ? 'conflict' : 'failed', syncDetail: problems.join(' ') }));
        (await this.repo.addEvent(id, who(actor), conflict ? 'write_conflict' : 'write_blocked', 'approved', 'approved', { problems }));
        return { ok: false, revision: (await this.mustRevision(id)), message: problems.join(' '), outcome: conflict ? 'conflict' : 'blocked' };
      }

      const attemptId = (await this.repo.startAttempt({ revisionId: id, purpose: 'replace', key, mode: gw.mode, plan }));
      try {
        await gw.writeCells(plan.cells.map((c) => ({ ref: c.ref, value: c.after })));
      } catch (e) {
        const d = describeError(e);
        (await this.repo.finishAttempt(attemptId, 'failed', { errorKind: d.kind, errorMessage: d.message }));
        return (await this.failWrite(rev, actor, key, attemptId, d.kind, d.message, true));
      }

      // Verify by reading back the cells and the formula-driven comparison.
      const after = await gw.readCells(plan.cells.map((c) => c.ref));
      const mismatched = after.filter((c, i) => c.value !== plan.cells[i].after).map((c) => c.ref);
      await this.refresh();
      const wb2 = await this.workbook();
      const pred = plan.predictions.find((p) => p.sourceId === rev.sourceId && p.lang === rev.language);
      const cr = wb2.parsed.changeRef.find((x) => x.sourceId === rev.sourceId && x.lang === rev.language);
      const inUpdates = wb2.parsed.updatesRows.some((x) => x.sourceId === rev.sourceId && x.lang === rev.language);
      const verify = {
        cellsMatch: mismatched.length === 0, mismatched,
        changeReferenceAction: cr?.action ?? null, expectedAction: pred?.action ?? null,
        visibleInUpdatesForAnabelle: inUpdates, expectedInUpdates: pred?.inUpdates ?? null,
        translationsFlagged: rev.language === 'EN'
          ? wb2.parsed.changeRef.filter((x) => x.sourceId === rev.sourceId && x.lang !== 'EN').map((x) => ({ lang: x.lang, check: x.translationCheck, action: x.action }))
          : [],
      };
      if (mismatched.length) {
        (await this.repo.finishAttempt(attemptId, 'failed', { errorKind: 'verify', errorMessage: `Read-back mismatch at ${mismatched.join(', ')}`, verify }));
        return (await this.failWrite(rev, actor, key, null, 'verify', `Google accepted the write but the read-back did not match at ${mismatched.join(', ')}.`));
      }
      (await this.repo.finishAttempt(attemptId, 'succeeded', { verify }));
      const mechanismOk = verify.changeReferenceAction === verify.expectedAction && verify.visibleInUpdatesForAnabelle === verify.expectedInUpdates;
      return (await this.markWritten(rev, actor, mechanismOk
        ? 'Written and verified. Updates for Anabelle shows the change.'
        : `Written and verified, but Updates for Anabelle did not respond as expected (action: ${verify.changeReferenceAction}). Check the workbook.`, 'succeeded', verify));
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async markWritten(rev: Revision, actor: Actor, message: string, outcome: string, verify?: object) {
    await this.repo.tx(async () => {
      (await this.repo.updateRevision(rev.id, { state: 'written', syncState: 'written', syncDetail: message }));
      (await this.repo.addEvent(rev.id, who(actor), 'written_to_sheet', 'approved', 'written', { outcome, verify }));
      // Older open proposals for the same line were based on wording that no longer exists.
      for (const o of (await this.repo.listRevisions({ sourceId: rev.sourceId, language: rev.language }))) {
        if (o.id !== rev.id && o.kind === 'replace' && ['draft', 'submitted', 'changes_requested', 'approved'].includes(o.state)) {
          (await this.repo.updateRevision(o.id, { syncDetail: 'The Sheet wording changed (another proposal was written). Review this proposal against the new wording.' }));
          (await this.repo.addEvent(o.id, who(actor), 'base_changed', null, null, { by: rev.id }));
        }
      }
    });
    return { ok: true, revision: (await this.mustRevision(rev.id)), message, outcome };
  }

  private async failWrite(rev: Revision, actor: Actor, key: string, attemptId: number | null, kind: string, message: string, retryable = false) {
    (await this.repo.updateRevision(rev.id, { syncState: 'failed', syncDetail: `${message}${retryable ? ' Your approved wording is kept; retry with “Update Sheet”.' : ''}` }));
    (await this.repo.addEvent(rev.id, who(actor), 'write_failed', 'approved', 'approved', { kind, message, key, attemptId }));
    return { ok: false, revision: (await this.mustRevision(rev.id)), message, outcome: 'failed' };
  }

  /** Approve the current Sheet wording exactly as it is (no Sheet change). */
  async approveAsIs(sourceId: string, lang: Lang, actor: Actor, note = '') {
    const item = await this.item(sourceId);
    if (!item) throw new StudioError(404, 'Unknown source ID');
    const text = item.versions[lang].text;
    if (!text) throw new StudioError(400, 'There is no wording to approve.');
    const errs = validateText(text, item.assetType, item.usages.map((u) => u.format)).filter((v) => v.level === 'error');
    if (errs.length) throw new StudioError(422, errs.map((e) => e.message).join(' '));
    const a: Approval = {
      id: newId('apr'), revisionId: null, sourceId, language: lang, text, textFp: fp(text), englishText: item.versions.EN.text,
      englishFp: fp(item.versions.EN.text), approvedBy: who(actor), approvedAt: now(), note, revokedAt: null, revokedReason: null,
    };
    (await this.repo.insertApproval(a));
    return a;
  }

  async revokeApproval(approvalId: string, actor: Actor, reason: string) {
    (await this.repo.revokeApprovals({ id: approvalId }, `${reason} — ${who(actor)}`));
  }

  // ------------------------------------------------------------------ acknowledgement (Anabelle)
  async acknowledge(input: { revisionId?: string | null; sourceId: string; language: Lang; appliedText: string; note?: string }, actor: Actor) {
    const wb = await this.workbook();
    const cr = wb.parsed.changeRef.find((r) => r.sourceId === input.sourceId && r.lang === input.language);
    if (!cr) throw new StudioError(404, 'No Change reference row for this line.');
    if (cr.current !== input.appliedText) throw new StudioError(409, `The Sheet now reads “${cr.current}”. Acknowledge only the wording you applied.`);
    const ack = {
      id: newId('ack'), revisionId: input.revisionId ?? null, sourceId: input.sourceId, language: input.language, appliedText: input.appliedText,
      appliedFp: fp(input.appliedText), acknowledgedBy: who(actor), acknowledgedAt: now(), note: input.note ?? '',
      referenceState: 'not_advanced' as const, referenceDetail: '', referenceAt: null,
    };
    (await this.repo.insertAck(ack));
    if (input.revisionId) (await this.repo.addEvent(input.revisionId, who(actor), 'application_acknowledged', null, null, { note: 'Anabelle reports she applied this wording. Not verified against Google Ads.' }));
    return ack;
  }

  /** Separate, explicit action: copy current wording into the saved reference so the row leaves Updates for Anabelle. */
  async advanceReference(ackId: string, actor: Actor) {
    const ack = (await this.repo.getAck(ackId));
    if (!ack) throw new StudioError(404, 'Acknowledgement not found');
    if (ack.referenceState === 'advanced') return { ok: true, message: 'Reference already advanced.' };
    const gw = this.gateway();
    if (!gw.canWrite) throw new StudioError(409, `${gw.describe()} is read-only.`);
    const r = await this.refresh();
    if (!r.ok) throw new StudioError(503, r.error!.message);
    const wb = await this.workbook();
    const plan = planAdvanceReference(wb.parsed, ack.sourceId, ack.language, ack.appliedText);
    const key = `advance:${ack.id}`;
    if (!plan.ok) {
      const a = (await this.repo.startAttempt({ revisionId: ack.revisionId, purpose: 'advance_reference', key, mode: gw.mode, plan }));
      (await this.repo.finishAttempt(a, 'conflict', { errorKind: 'conflict', errorMessage: plan.blockers.join(' ') }));
      (await this.repo.updateAck(ack.id, 'conflict', plan.blockers.join(' ')));
      return { ok: false, message: plan.blockers.join(' ') };
    }
    const reads = await gw.readCells([...plan.mustNotBeFormula, ...plan.guards.map((g) => g.ref)]);
    const map = new Map(reads.map((c) => [c.ref, c]));
    const bad = [...plan.mustNotBeFormula.filter((r) => map.get(r)?.formula), ...plan.guards.filter((g) => map.get(g.ref)?.value !== g.equals).map((g) => g.ref)];
    if (bad.length) { (await this.repo.updateAck(ack.id, 'conflict', `Unexpected cell state at ${bad.join(', ')}`)); return { ok: false, message: `Unexpected cell state at ${bad.join(', ')}` }; }
    const attemptId = (await this.repo.startAttempt({ revisionId: ack.revisionId, purpose: 'advance_reference', key, mode: gw.mode, plan }));
    try {
      await gw.writeCells(plan.cells.map((c) => ({ ref: c.ref, value: c.after })));
    } catch (e) {
      const d = describeError(e);
      (await this.repo.finishAttempt(attemptId, 'failed', { errorKind: d.kind, errorMessage: d.message }));
      (await this.repo.updateAck(ack.id, 'failed', d.message));
      return { ok: false, message: `Reference not advanced: ${d.message}` };
    }
    await this.refresh();
    const wb2 = await this.workbook();
    const row = wb2.parsed.changeRef.find((x) => x.sourceId === ack.sourceId && x.lang === ack.language);
    const verify = { action: row?.action, stillInUpdates: wb2.parsed.updatesRows.some((x) => x.sourceId === ack.sourceId && x.lang === ack.language) };
    (await this.repo.finishAttempt(attemptId, 'succeeded', { verify }));
    (await this.repo.updateAck(ack.id, 'advanced', `Reference advanced. Change reference now shows “${row?.action}”.`));
    if (ack.revisionId) (await this.repo.addEvent(ack.revisionId, who(actor), 'reference_advanced', null, null, verify));
    return { ok: true, message: `Saved reference advanced. The row now shows “${row?.action}”.`, verify };
  }

  // ------------------------------------------------------------------ feedback
  async addFeedback(input: { combo: { key: string; campaign: string; group: string; format: string; language: Lang; slots: { slot: string; sourceId: string; text: string; state: string }[] }; verdict: FeedbackRow['verdict']; reasons: string[]; comment: string }, actor: Actor) {
    if (!['works', 'needs_changes', 'comment'].includes(input.verdict)) throw new StudioError(400, 'Unknown verdict');
    if (input.verdict === 'comment' && !input.comment.trim()) throw new StudioError(400, 'Add a comment.');
    const combo = { ...input.combo, slots: input.combo.slots.map((s) => ({ ...s, fp: fp(s.text) })) };
    const row: FeedbackRow = {
      id: newId('fb'), comboKey: input.combo.key, combo, verdict: input.verdict, reasons: input.reasons ?? [], comment: input.comment ?? '',
      reviewer: who(actor), createdAt: now(), resolvedAt: null, resolution: null,
    };
    (await this.repo.insertFeedback(row));
    return row;
  }

  /** Feedback with a "wording changed since" marker per slot. */
  async feedback() {
    const wb = await this.workbook();
    const byId = new Map(wb.library.map((i) => [i.sourceId, i]));
    return (await this.repo.listFeedback()).map((f) => {
      const changed = (f.combo.slots as any[]).filter((s) => {
        if (s.state !== 'sheet') {
          return true; // feedback given on a proposal: compare with Sheet
        }
        const now = byId.get(s.sourceId)?.versions[f.combo.language as Lang]?.text;
        return now === undefined || fp(now) !== s.fp;
      }).map((s) => ({ slot: s.slot, sourceId: s.sourceId, then: s.text, now: byId.get(s.sourceId)?.versions[f.combo.language as Lang]?.text ?? null }))
        .filter((c) => c.now !== c.then);
      return { ...f, changedSince: changed };
    });
  }
}
