// Typed data access. Everything that touches SQL is here.
import type { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import type { Lang } from '../workbook/types';

export type RevisionKind = 'replace' | 'variation' | 'retire';
export type RevisionState = 'draft' | 'submitted' | 'changes_requested' | 'approved' | 'written' | 'withdrawn' | 'superseded';
export type SyncState = 'none' | 'pending' | 'conflict' | 'failed' | 'written' | 'local_only';

export interface RevisionMeta {
  theme?: string;
  assetType?: string;
  intent?: string;
  linkedHeadline?: string | null;
  targets?: { campaign: string; group: string }[]; // variations: where it is intended to be used
  previewFormat?: string;
  collection?: string; // collection a new line was added in
  basedOnRevisionId?: string | null; // translation drafted against a proposed English revision
}

export interface Revision {
  id: string;
  kind: RevisionKind;
  sourceId: string;
  language: Lang;
  baseText: string;
  baseFp: string;
  baseReadId: number | null;
  proposedText: string;
  englishBasis: string;
  englishBasisFp: string;
  reason: string;
  meta: RevisionMeta;
  state: RevisionState;
  syncState: SyncState;
  syncDetail: string;
  isTest: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string; revisionId: string | null; sourceId: string; language: Lang;
  text: string; textFp: string; englishText: string; englishFp: string;
  approvedBy: string; approvedAt: string; note: string; revokedAt: string | null; revokedReason: string | null;
}

export interface FeedbackRow {
  id: string; comboKey: string; combo: any; verdict: 'works' | 'needs_changes' | 'comment';
  reasons: string[]; comment: string; reviewer: string; createdAt: string; resolvedAt: string | null; resolution: string | null;
}

export interface Acknowledgement {
  id: string; revisionId: string | null; sourceId: string; language: Lang; appliedText: string; appliedFp: string;
  acknowledgedBy: string; acknowledgedAt: string; note: string;
  referenceState: 'not_advanced' | 'advanced' | 'failed' | 'conflict'; referenceDetail: string; referenceAt: string | null;
}

export interface WriteAttempt {
  id: number; revisionId: string | null; purpose: string; idempotencyKey: string; mode: string; plan: any;
  status: string; errorKind: string | null; errorMessage: string | null; verify: any; startedAt: string; finishedAt: string | null;
}

export const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

const toRevision = (r: any): Revision => ({
  id: r.id, kind: r.kind, sourceId: r.source_id, language: r.language, baseText: r.base_text, baseFp: r.base_fp,
  baseReadId: r.base_read_id, proposedText: r.proposed_text, englishBasis: r.english_basis, englishBasisFp: r.english_basis_fp,
  reason: r.reason, meta: JSON.parse(r.meta_json), state: r.state, syncState: r.sync_state, syncDetail: r.sync_detail,
  isTest: !!r.is_test, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toApproval = (r: any): Approval => ({
  id: r.id, revisionId: r.revision_id, sourceId: r.source_id, language: r.language, text: r.text, textFp: r.text_fp,
  englishText: r.english_text, englishFp: r.english_fp, approvedBy: r.approved_by, approvedAt: r.approved_at, note: r.note,
  revokedAt: r.revoked_at, revokedReason: r.revoked_reason,
});

export class Repo {
  constructor(public db: DatabaseSync) {}

  // ---- settings
  getSetting(key: string): string | null {
    return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any)?.value ?? null;
  }
  setSetting(key: string, value: string) {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  // ---- sheet reads
  startRead(mode: string): number {
    return Number(this.db.prepare('INSERT INTO sheet_reads (mode, started_at) VALUES (?, ?)').run(mode, now()).lastInsertRowid);
  }
  finishRead(id: number, ok: boolean, data: { raw?: string; fingerprint?: string; errorKind?: string; errorMessage?: string }) {
    this.db.prepare('UPDATE sheet_reads SET finished_at = ?, ok = ?, raw_json = ?, fingerprint = ?, error_kind = ?, error_message = ? WHERE id = ?')
      .run(now(), ok ? 1 : 0, data.raw ?? null, data.fingerprint ?? null, data.errorKind ?? null, data.errorMessage ?? null, id);
    // Keep the database small: retain the raw JSON of the last 20 successful reads per mode.
    this.db.prepare(`UPDATE sheet_reads SET raw_json = NULL WHERE ok = 1 AND raw_json IS NOT NULL AND id NOT IN
      (SELECT id FROM sheet_reads WHERE ok = 1 AND raw_json IS NOT NULL ORDER BY id DESC LIMIT 20)`).run();
  }
  lastGoodRead(mode: string): { id: number; raw: string; finishedAt: string } | null {
    const r = this.db.prepare('SELECT id, raw_json, finished_at FROM sheet_reads WHERE mode = ? AND ok = 1 AND raw_json IS NOT NULL ORDER BY id DESC LIMIT 1').get(mode) as any;
    return r ? { id: r.id, raw: r.raw_json, finishedAt: r.finished_at } : null;
  }
  lastRead(mode: string): any {
    return this.db.prepare('SELECT id, mode, started_at, finished_at, ok, error_kind, error_message FROM sheet_reads WHERE mode = ? ORDER BY id DESC LIMIT 1').get(mode) ?? null;
  }

  // ---- revisions
  insertRevision(r: Revision) {
    this.db.prepare(`INSERT INTO revisions (id, kind, source_id, language, base_text, base_fp, base_read_id, proposed_text,
      english_basis, english_basis_fp, reason, meta_json, state, sync_state, sync_detail, is_test, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      r.id, r.kind, r.sourceId, r.language, r.baseText, r.baseFp, r.baseReadId, r.proposedText, r.englishBasis, r.englishBasisFp,
      r.reason, JSON.stringify(r.meta), r.state, r.syncState, r.syncDetail, r.isTest ? 1 : 0, r.createdBy, r.createdAt, r.updatedAt);
  }
  updateRevision(id: string, patch: Partial<Pick<Revision, 'proposedText' | 'englishBasis' | 'englishBasisFp' | 'reason' | 'meta' | 'state' | 'syncState' | 'syncDetail' | 'sourceId' | 'baseText' | 'baseFp'>>) {
    const cols: Record<string, string> = {
      proposedText: 'proposed_text', englishBasis: 'english_basis', englishBasisFp: 'english_basis_fp', reason: 'reason',
      meta: 'meta_json', state: 'state', syncState: 'sync_state', syncDetail: 'sync_detail', sourceId: 'source_id',
      baseText: 'base_text', baseFp: 'base_fp',
    };
    const sets: string[] = [], vals: any[] = [];
    for (const [k, v] of Object.entries(patch)) { sets.push(`${cols[k]} = ?`); vals.push(k === 'meta' ? JSON.stringify(v) : v); }
    sets.push('updated_at = ?'); vals.push(now());
    this.db.prepare(`UPDATE revisions SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  }
  getRevision(id: string): Revision | null {
    const r = this.db.prepare('SELECT * FROM revisions WHERE id = ?').get(id);
    return r ? toRevision(r) : null;
  }
  listRevisions(filter: { sourceId?: string; language?: Lang; states?: string[] } = {}): Revision[] {
    const where: string[] = [], vals: any[] = [];
    if (filter.sourceId) { where.push('source_id = ?'); vals.push(filter.sourceId); }
    if (filter.language) { where.push('language = ?'); vals.push(filter.language); }
    if (filter.states?.length) { where.push(`state IN (${filter.states.map(() => '?').join(',')})`); vals.push(...filter.states); }
    const sql = `SELECT * FROM revisions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`;
    return this.db.prepare(sql).all(...vals).map(toRevision);
  }
  addEvent(revisionId: string, actor: string, action: string, from: string | null, to: string | null, detail: object = {}) {
    this.db.prepare('INSERT INTO revision_events (revision_id, at, actor, action, from_state, to_state, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(revisionId, now(), actor, action, from, to, JSON.stringify(detail));
  }
  events(revisionId: string) {
    return this.db.prepare('SELECT * FROM revision_events WHERE revision_id = ? ORDER BY id').all(revisionId)
      .map((e: any) => ({ id: e.id, at: e.at, actor: e.actor, action: e.action, from: e.from_state, to: e.to_state, detail: JSON.parse(e.detail_json) }));
  }

  // ---- approvals
  insertApproval(a: Approval) {
    this.db.prepare(`INSERT INTO approvals (id, revision_id, source_id, language, text, text_fp, english_text, english_fp, approved_by, approved_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, a.revisionId, a.sourceId, a.language, a.text, a.textFp, a.englishText, a.englishFp, a.approvedBy, a.approvedAt, a.note);
  }
  revokeApprovals(where: { revisionId?: string; id?: string }, reason: string): number {
    if (where.id) return Number(this.db.prepare('UPDATE approvals SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL').run(now(), reason, where.id).changes);
    return Number(this.db.prepare('UPDATE approvals SET revoked_at = ?, revoked_reason = ? WHERE revision_id = ? AND revoked_at IS NULL').run(now(), reason, where.revisionId!).changes);
  }
  approvalsFor(sourceId: string, language: Lang): Approval[] {
    return this.db.prepare('SELECT * FROM approvals WHERE source_id = ? AND language = ? ORDER BY approved_at DESC').all(sourceId, language).map(toApproval);
  }
  approvalsForRevision(revisionId: string): Approval[] {
    return this.db.prepare('SELECT * FROM approvals WHERE revision_id = ? ORDER BY approved_at DESC').all(revisionId).map(toApproval);
  }
  allApprovals(): Approval[] {
    return this.db.prepare('SELECT * FROM approvals ORDER BY approved_at DESC').all().map(toApproval);
  }

  // ---- write attempts
  startAttempt(a: { revisionId: string | null; purpose: string; key: string; mode: string; plan: any }): number {
    return Number(this.db.prepare('INSERT INTO write_attempts (revision_id, purpose, idempotency_key, mode, plan_json, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(a.revisionId, a.purpose, a.key, a.mode, JSON.stringify(a.plan), 'started', now()).lastInsertRowid);
  }
  finishAttempt(id: number, status: string, extra: { errorKind?: string; errorMessage?: string; verify?: any } = {}) {
    this.db.prepare('UPDATE write_attempts SET status = ?, error_kind = ?, error_message = ?, verify_json = ?, finished_at = ? WHERE id = ?')
      .run(status, extra.errorKind ?? null, extra.errorMessage ?? null, extra.verify ? JSON.stringify(extra.verify) : null, now(), id);
  }
  attempts(filter: { revisionId?: string; limit?: number } = {}): WriteAttempt[] {
    const rows = filter.revisionId
      ? this.db.prepare('SELECT * FROM write_attempts WHERE revision_id = ? ORDER BY id DESC').all(filter.revisionId)
      : this.db.prepare('SELECT * FROM write_attempts ORDER BY id DESC LIMIT ?').all(filter.limit ?? 50);
    return rows.map((r: any) => ({
      id: r.id, revisionId: r.revision_id, purpose: r.purpose, idempotencyKey: r.idempotency_key, mode: r.mode, plan: JSON.parse(r.plan_json),
      status: r.status, errorKind: r.error_kind, errorMessage: r.error_message, verify: r.verify_json ? JSON.parse(r.verify_json) : null,
      startedAt: r.started_at, finishedAt: r.finished_at,
    }));
  }
  succeededAttempt(key: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM write_attempts WHERE idempotency_key = ? AND status IN ('succeeded','already_applied') LIMIT 1").get(key);
  }

  // ---- feedback
  insertFeedback(f: FeedbackRow) {
    this.db.prepare('INSERT INTO feedback (id, combo_key, combo_json, verdict, reasons_json, comment, reviewer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(f.id, f.comboKey, JSON.stringify(f.combo), f.verdict, JSON.stringify(f.reasons), f.comment, f.reviewer, f.createdAt);
  }
  resolveFeedback(id: string, resolution: string) {
    this.db.prepare('UPDATE feedback SET resolved_at = ?, resolution = ? WHERE id = ?').run(now(), resolution, id);
  }
  listFeedback(): FeedbackRow[] {
    return this.db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all().map((r: any) => ({
      id: r.id, comboKey: r.combo_key, combo: JSON.parse(r.combo_json), verdict: r.verdict, reasons: JSON.parse(r.reasons_json),
      comment: r.comment, reviewer: r.reviewer, createdAt: r.created_at, resolvedAt: r.resolved_at, resolution: r.resolution,
    }));
  }

  // ---- pins
  pins(campaign: string, group: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.db.prepare('SELECT source_id, position FROM pin_proposals WHERE campaign = ? AND grp = ?').all(campaign, group) as any[]) out[r.source_id] = r.position;
    return out;
  }
  setPin(campaign: string, group: string, sourceId: string, position: string | null, by: string) {
    if (!position) this.db.prepare('DELETE FROM pin_proposals WHERE campaign = ? AND grp = ? AND source_id = ?').run(campaign, group, sourceId);
    else this.db.prepare(`INSERT INTO pin_proposals (campaign, grp, source_id, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign, grp, source_id) DO UPDATE SET position = excluded.position, created_by = excluded.created_by, created_at = excluded.created_at`)
      .run(campaign, group, sourceId, position, by, now());
  }

  // ---- acknowledgements
  insertAck(a: Acknowledgement) {
    this.db.prepare(`INSERT INTO acknowledgements (id, revision_id, source_id, language, applied_text, applied_fp, acknowledged_by, acknowledged_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, a.revisionId, a.sourceId, a.language, a.appliedText, a.appliedFp, a.acknowledgedBy, a.acknowledgedAt, a.note);
  }
  updateAck(id: string, state: Acknowledgement['referenceState'], detail: string) {
    this.db.prepare('UPDATE acknowledgements SET reference_state = ?, reference_detail = ?, reference_at = ? WHERE id = ?').run(state, detail, now(), id);
  }
  getAck(id: string): Acknowledgement | null {
    return this.listAcks().find((a) => a.id === id) ?? null;
  }
  listAcks(): Acknowledgement[] {
    return this.db.prepare('SELECT * FROM acknowledgements ORDER BY acknowledged_at DESC').all().map((r: any) => ({
      id: r.id, revisionId: r.revision_id, sourceId: r.source_id, language: r.language, appliedText: r.applied_text, appliedFp: r.applied_fp,
      acknowledgedBy: r.acknowledged_by, acknowledgedAt: r.acknowledged_at, note: r.note, referenceState: r.reference_state,
      referenceDetail: r.reference_detail, referenceAt: r.reference_at,
    }));
  }

  // ---- export batches
  insertBatch(b: { id: string; createdBy: string; mode: string; filters: any; items: any; csv: string; rowCount: number; label: string }) {
    this.db.prepare('INSERT INTO export_batches (id, created_at, created_by, mode, filters_json, items_json, csv, row_count, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.id, now(), b.createdBy, b.mode, JSON.stringify(b.filters), JSON.stringify(b.items), b.csv, b.rowCount, b.label);
  }
  listBatches() {
    return this.db.prepare('SELECT id, created_at, created_by, mode, filters_json, row_count, label FROM export_batches ORDER BY created_at DESC').all()
      .map((r: any) => ({ id: r.id, createdAt: r.created_at, createdBy: r.created_by, mode: r.mode, filters: JSON.parse(r.filters_json), rowCount: r.row_count, label: r.label }));
  }
  getBatch(id: string) {
    const r = this.db.prepare('SELECT * FROM export_batches WHERE id = ?').get(id) as any;
    return r ? { id: r.id, createdAt: r.created_at, csv: r.csv as string, label: r.label as string, items: JSON.parse(r.items_json) } : null;
  }
}
