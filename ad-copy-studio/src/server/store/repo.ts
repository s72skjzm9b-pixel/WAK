// Typed data access. Everything that touches SQL is here.
import type { Sql } from './sql';
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
  linkedHeadlineId?: string | null; // stable pairing (description → headline source ID)
  separatedFrom?: string | null; // a separate version made from shared wording
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
  readyAt: string | null; // marked Ready for review
  appliedAt: string | null; // applied in Google Ads / registered — moves to history
  appliedBy: string | null;
  archivedAt: string | null;
}

export interface Approval {
  id: string; revisionId: string | null; sourceId: string; language: Lang;
  text: string; textFp: string; englishText: string; englishFp: string;
  approvedBy: string; approvedAt: string; note: string; revokedAt: string | null; revokedReason: string | null;
}

export interface FeedbackRow {
  id: string; comboKey: string; combo: any; verdict: 'works' | 'needs_changes' | 'comment';
  reasons: string[]; comment: string; reviewer: string; createdAt: string; resolvedAt: string | null; resolution: string | null;
  supersededAt?: string | null; scope?: { kind: 'combination' | 'lines'; lines?: { sourceId: string; slot: string }[] }; language?: string;
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
  readyAt: r.ready_at ?? null, appliedAt: r.applied_at ?? null, appliedBy: r.applied_by ?? null, archivedAt: r.archived_at ?? null,
});
const toApproval = (r: any): Approval => ({
  id: r.id, revisionId: r.revision_id, sourceId: r.source_id, language: r.language, text: r.text, textFp: r.text_fp,
  englishText: r.english_text, englishFp: r.english_fp, approvedBy: r.approved_by, approvedAt: r.approved_at, note: r.note,
  revokedAt: r.revoked_at, revokedReason: r.revoked_reason,
});

export class Repo {
  constructor(public sql: Sql) {}
  private all(q: string, p: unknown[]): Promise<any[]> { return this.sql.all(q, p); }
  private async one(q: string, p: unknown[]): Promise<any> { return (await this.sql.all(q, p))[0] ?? undefined; }
  private run(q: string, p: unknown[]): Promise<any[]> { return this.sql.all(q, p); }
  /** Run several writes atomically. Calls to this repo inside `fn` join the transaction. */
  tx<T>(fn: () => Promise<T>): Promise<T> { return this.sql.tx(fn); }

  // ---- settings
  async getSetting(key: string): Promise<string | null> {
    return ((await this.one('SELECT value FROM settings WHERE key = ?', [key])) as any)?.value ?? null;
  }
  async setSetting(key: string, value: string) {
    (await this.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]));
  }

  // ---- sheet reads
  async startRead(mode: string): Promise<number> {
    return Number((await this.one('INSERT INTO sheet_reads (mode, started_at) VALUES (?, ?) RETURNING id', [mode, now()])).id);
  }
  async finishRead(id: number, ok: boolean, data: { raw?: string; fingerprint?: string; errorKind?: string; errorMessage?: string }) {
    (await this.run('UPDATE sheet_reads SET finished_at = ?, ok = ?, raw_json = ?, fingerprint = ?, error_kind = ?, error_message = ? WHERE id = ?', [now(), ok ? 1 : 0, data.raw ?? null, data.fingerprint ?? null, data.errorKind ?? null, data.errorMessage ?? null, id]));
    // Keep the database small: retain the raw JSON of the last 20 successful reads per mode.
    (await this.run(`UPDATE sheet_reads SET raw_json = NULL WHERE ok = 1 AND raw_json IS NOT NULL AND id NOT IN
      (SELECT id FROM sheet_reads WHERE ok = 1 AND raw_json IS NOT NULL ORDER BY id DESC LIMIT 20)`, []));
  }
  async lastGoodRead(mode: string): Promise<{ id: number; raw: string; finishedAt: string } | null> {
    const r = (await this.one('SELECT id, raw_json, finished_at FROM sheet_reads WHERE mode = ? AND ok = 1 AND raw_json IS NOT NULL ORDER BY id DESC LIMIT 1', [mode])) as any;
    return r ? { id: Number(r.id), raw: r.raw_json, finishedAt: r.finished_at } : null;
  }
  async lastRead(mode: string): Promise<any> {
    return (await this.one('SELECT id, mode, started_at, finished_at, ok, error_kind, error_message FROM sheet_reads WHERE mode = ? ORDER BY id DESC LIMIT 1', [mode])) ?? null;
  }

  // ---- revisions
  async getRead(id: number | null): Promise<{ id: number; mode: string; finishedAt: string; readAt: string | null } | null> {
    if (id == null) return null;
    const r = (await this.one('SELECT id, mode, finished_at FROM sheet_reads WHERE id = ?', [id])) as any;
    return r ? { id: Number(r.id), mode: r.mode, finishedAt: r.finished_at, readAt: r.finished_at } : null;
  }

  async insertRevision(r: Revision) {
    (await this.run(`INSERT INTO revisions (id, kind, source_id, language, base_text, base_fp, base_read_id, proposed_text,
      english_basis, english_basis_fp, reason, meta_json, state, sync_state, sync_detail, is_test, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [r.id, r.kind, r.sourceId, r.language, r.baseText, r.baseFp, r.baseReadId, r.proposedText, r.englishBasis, r.englishBasisFp,
      r.reason, JSON.stringify(r.meta), r.state, r.syncState, r.syncDetail, r.isTest ? 1 : 0, r.createdBy, r.createdAt, r.updatedAt]));
  }
  async updateRevision(id: string, patch: Partial<Pick<Revision, 'proposedText' | 'englishBasis' | 'englishBasisFp' | 'reason' | 'meta' | 'state' | 'syncState' | 'syncDetail' | 'sourceId' | 'baseText' | 'baseFp' | 'readyAt' | 'appliedAt' | 'appliedBy' | 'archivedAt'>>) {
    const cols: Record<string, string> = {
      proposedText: 'proposed_text', englishBasis: 'english_basis', englishBasisFp: 'english_basis_fp', reason: 'reason',
      meta: 'meta_json', state: 'state', syncState: 'sync_state', syncDetail: 'sync_detail', sourceId: 'source_id',
      baseText: 'base_text', baseFp: 'base_fp', readyAt: 'ready_at', appliedAt: 'applied_at', appliedBy: 'applied_by', archivedAt: 'archived_at',
    };
    const sets: string[] = [], vals: any[] = [];
    for (const [k, v] of Object.entries(patch)) { sets.push(`${cols[k]} = ?`); vals.push(k === 'meta' ? JSON.stringify(v) : v); }
    sets.push('updated_at = ?'); vals.push(now());
    (await this.run(`UPDATE revisions SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]));
  }
  async getRevision(id: string): Promise<Revision | null> {
    const r = (await this.one('SELECT * FROM revisions WHERE id = ?', [id]));
    return r ? toRevision(r) : null;
  }
  async listRevisions(filter: { sourceId?: string; language?: Lang; states?: string[] } = {}): Promise<Revision[]> {
    const where: string[] = [], vals: any[] = [];
    if (filter.sourceId) { where.push('source_id = ?'); vals.push(filter.sourceId); }
    if (filter.language) { where.push('language = ?'); vals.push(filter.language); }
    if (filter.states?.length) { where.push(`state IN (${filter.states.map(() => '?').join(',')})`); vals.push(...filter.states); }
    const sql = `SELECT * FROM revisions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`;
    return (await this.all(sql, [...vals])).map(toRevision);
  }
  async addEvent(revisionId: string, actor: string, action: string, from: string | null, to: string | null, detail: object = {}) {
    (await this.run('INSERT INTO revision_events (revision_id, at, actor, action, from_state, to_state, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [revisionId, now(), actor, action, from, to, JSON.stringify(detail)]));
  }
  async events(revisionId: string) {
    return (await this.all('SELECT * FROM revision_events WHERE revision_id = ? ORDER BY id', [revisionId]))
      .map((e: any) => ({ id: e.id, at: e.at, actor: e.actor, action: e.action, from: e.from_state, to: e.to_state, detail: JSON.parse(e.detail_json) }));
  }

  // ---- approvals
  async insertApproval(a: Approval) {
    (await this.run(`INSERT INTO approvals (id, revision_id, source_id, language, text, text_fp, english_text, english_fp, approved_by, approved_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [a.id, a.revisionId, a.sourceId, a.language, a.text, a.textFp, a.englishText, a.englishFp, a.approvedBy, a.approvedAt, a.note]));
  }
  async revokeApprovals(where: { revisionId?: string; id?: string }, reason: string): Promise<number> {
    if (where.id) return (await this.run('UPDATE approvals SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL RETURNING id', [now(), reason, where.id])).length;
    return (await this.run('UPDATE approvals SET revoked_at = ?, revoked_reason = ? WHERE revision_id = ? AND revoked_at IS NULL RETURNING id', [now(), reason, where.revisionId!])).length;
  }
  async approvalsFor(sourceId: string, language: Lang): Promise<Approval[]> {
    return (await this.all('SELECT * FROM approvals WHERE source_id = ? AND language = ? ORDER BY approved_at DESC', [sourceId, language])).map(toApproval);
  }
  async approvalsForRevision(revisionId: string): Promise<Approval[]> {
    return (await this.all('SELECT * FROM approvals WHERE revision_id = ? ORDER BY approved_at DESC', [revisionId])).map(toApproval);
  }
  async allApprovals(): Promise<Approval[]> {
    return (await this.all('SELECT * FROM approvals ORDER BY approved_at DESC', [])).map(toApproval);
  }

  // ---- write attempts
  async startAttempt(a: { revisionId: string | null; purpose: string; key: string; mode: string; plan: any }): Promise<number> {
    return Number((await this.one('INSERT INTO write_attempts (revision_id, purpose, idempotency_key, mode, plan_json, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', [a.revisionId, a.purpose, a.key, a.mode, JSON.stringify(a.plan), 'started', now()])).id);
  }
  async finishAttempt(id: number, status: string, extra: { errorKind?: string; errorMessage?: string; verify?: any } = {}) {
    (await this.run('UPDATE write_attempts SET status = ?, error_kind = ?, error_message = ?, verify_json = ?, finished_at = ? WHERE id = ?', [status, extra.errorKind ?? null, extra.errorMessage ?? null, extra.verify ? JSON.stringify(extra.verify) : null, now(), id]));
  }
  async attempts(filter: { revisionId?: string; limit?: number } = {}): Promise<WriteAttempt[]> {
    const rows = filter.revisionId
      ? (await this.all('SELECT * FROM write_attempts WHERE revision_id = ? ORDER BY id DESC', [filter.revisionId]))
      : (await this.all('SELECT * FROM write_attempts ORDER BY id DESC LIMIT ?', [filter.limit ?? 50]));
    return rows.map((r: any) => ({
      id: r.id, revisionId: r.revision_id, purpose: r.purpose, idempotencyKey: r.idempotency_key, mode: r.mode, plan: JSON.parse(r.plan_json),
      status: r.status, errorKind: r.error_kind, errorMessage: r.error_message, verify: r.verify_json ? JSON.parse(r.verify_json) : null,
      startedAt: r.started_at, finishedAt: r.finished_at,
    }));
  }
  async succeededAttempt(key: string): Promise<boolean> {
    return !!(await this.one("SELECT 1 FROM write_attempts WHERE idempotency_key = ? AND status IN ('succeeded','already_applied') LIMIT 1", [key]));
  }

  // ---- feedback
  async insertFeedback(f: FeedbackRow) {
    (await this.run('INSERT INTO feedback (id, combo_key, combo_json, verdict, reasons_json, comment, reviewer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [f.id, f.comboKey, JSON.stringify(f.combo), f.verdict, JSON.stringify(f.reasons), f.comment, f.reviewer, f.createdAt]));
  }
  async resolveFeedback(id: string, resolution: string) {
    (await this.run('UPDATE feedback SET resolved_at = ?, resolution = ? WHERE id = ?', [now(), resolution, id]));
  }
  async listFeedback(): Promise<FeedbackRow[]> {
    return (await this.all('SELECT * FROM feedback ORDER BY created_at DESC', [])).map((r: any) => ({
      id: r.id, comboKey: r.combo_key, combo: JSON.parse(r.combo_json), verdict: r.verdict, reasons: JSON.parse(r.reasons_json),
      comment: r.comment, reviewer: r.reviewer, createdAt: r.created_at, resolvedAt: r.resolved_at, resolution: r.resolution,
      supersededAt: r.superseded_at ?? null, scope: r.scope_json ? JSON.parse(r.scope_json) : { kind: 'combination' }, language: r.language ?? JSON.parse(r.combo_json).language,
    }));
  }

  // ---- pins
  async pins(campaign: string, group: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const r of (await this.all('SELECT source_id, position FROM pin_proposals WHERE campaign = ? AND grp = ?', [campaign, group])) as any[]) out[r.source_id] = r.position;
    return out;
  }
  async setPin(campaign: string, group: string, sourceId: string, position: string | null, by: string) {
    if (!position) (await this.run('DELETE FROM pin_proposals WHERE campaign = ? AND grp = ? AND source_id = ?', [campaign, group, sourceId]));
    else (await this.run(`INSERT INTO pin_proposals (campaign, grp, source_id, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign, grp, source_id) DO UPDATE SET position = excluded.position, created_by = excluded.created_by, created_at = excluded.created_at`, [campaign, group, sourceId, position, by, now()]));
  }

  // ---- acknowledgements
  async insertAck(a: Acknowledgement) {
    (await this.run(`INSERT INTO acknowledgements (id, revision_id, source_id, language, applied_text, applied_fp, acknowledged_by, acknowledged_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [a.id, a.revisionId, a.sourceId, a.language, a.appliedText, a.appliedFp, a.acknowledgedBy, a.acknowledgedAt, a.note]));
  }
  async updateAck(id: string, state: Acknowledgement['referenceState'], detail: string) {
    (await this.run('UPDATE acknowledgements SET reference_state = ?, reference_detail = ?, reference_at = ? WHERE id = ?', [state, detail, now(), id]));
  }
  async getAck(id: string): Promise<Acknowledgement | null> {
    return (await this.listAcks()).find((a) => a.id === id) ?? null;
  }
  async listAcks(): Promise<Acknowledgement[]> {
    return (await this.all('SELECT * FROM acknowledgements ORDER BY acknowledged_at DESC', [])).map((r: any) => ({
      id: r.id, revisionId: r.revision_id, sourceId: r.source_id, language: r.language, appliedText: r.applied_text, appliedFp: r.applied_fp,
      acknowledgedBy: r.acknowledged_by, acknowledgedAt: r.acknowledged_at, note: r.note, referenceState: r.reference_state,
      referenceDetail: r.reference_detail, referenceAt: r.reference_at,
    }));
  }

  // ---- export batches
  async insertBatch(b: { id: string; createdBy: string; mode: string; filters: any; items: any; csv: string; rowCount: number; label: string }) {
    (await this.run('INSERT INTO export_batches (id, created_at, created_by, mode, filters_json, items_json, csv, row_count, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [b.id, now(), b.createdBy, b.mode, JSON.stringify(b.filters), JSON.stringify(b.items), b.csv, b.rowCount, b.label]));
  }
  async listBatches() {
    return (await this.all('SELECT id, created_at, created_by, mode, filters_json, row_count, label FROM export_batches ORDER BY created_at DESC', []))
      .map((r: any) => ({ id: r.id, createdAt: r.created_at, createdBy: r.created_by, mode: r.mode, filters: JSON.parse(r.filters_json), rowCount: r.row_count, label: r.label }));
  }
  async getBatch(id: string) {
    const r = (await this.one('SELECT * FROM export_batches WHERE id = ?', [id])) as any;
    return r ? { id: r.id, createdAt: r.created_at, csv: r.csv as string, label: r.label as string, items: JSON.parse(r.items_json) } : null;
  }

  // ---- blobs (hosted-only state: practice copy of the Sheet)
  async getBlob(key: string): Promise<string | null> { return (await this.one('SELECT value FROM blobs WHERE key = ?', [key]))?.value ?? null; }
  async setBlob(key: string, value: string) {
    await this.run('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [key, value, now()]);
  }

  // ---- collection briefs (labels and editorial settings only; never mappings)
  async collectionMeta(): Promise<Record<string, CollectionMeta>> {
    const out: Record<string, CollectionMeta> = {};
    for (const r of (await this.all('SELECT * FROM collections_meta', [])) as any[]) {
      out[r.key] = { key: r.key, name: r.name, description: r.description, imageNote: r.image_note, formats: r.formats_json ? JSON.parse(r.formats_json) : null,
        languages: r.languages_json ? JSON.parse(r.languages_json) : null, details: r.details_json ? JSON.parse(r.details_json) : {}, isLocal: !!r.is_local, createdAt: r.created_at };
    }
    return out;
  }
  async saveCollectionMeta(m: Partial<CollectionMeta> & { key: string }, by: string) {
    const cur = (await this.collectionMeta())[m.key];
    const v = { ...(cur ?? { name: null, description: null, imageNote: null, formats: null, languages: null, details: {}, isLocal: false }), ...m };
    (await this.run(`INSERT INTO collections_meta (key, name, description, image_note, formats_json, languages_json, details_json, is_local, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name, description = excluded.description, image_note = excluded.image_note,
      formats_json = excluded.formats_json, languages_json = excluded.languages_json, details_json = excluded.details_json, updated_at = excluded.updated_at`, [m.key, v.name, v.description, v.imageNote, v.formats ? JSON.stringify(v.formats) : null, v.languages ? JSON.stringify(v.languages) : null,
        JSON.stringify(v.details ?? {}), v.isLocal ? 1 : 0, by, cur?.createdAt ?? now(), now()]));
  }

  // ---- intended uses (studio intent; separate from factual Sheet mappings)
  async intendedUses(sourceId?: string): Promise<IntendedUse[]> {
    const rows = sourceId ? (await this.all('SELECT * FROM intended_uses WHERE source_id = ? AND removed_at IS NULL', [sourceId])) : (await this.all('SELECT * FROM intended_uses WHERE removed_at IS NULL', []));
    return (rows as any[]).map((r) => ({ id: r.id, sourceId: r.source_id, collection: r.collection_key, field: r.field, format: r.format, campaign: r.campaign, group: r.grp, createdBy: r.created_by, createdAt: r.created_at }));
  }
  async addIntendedUse(u: Omit<IntendedUse, 'id' | 'createdAt'>): Promise<IntendedUse> {
    const existing = (await this.intendedUses(u.sourceId)).find((x) => x.collection === u.collection && (x.format ?? null) === (u.format ?? null) && (x.campaign ?? null) === (u.campaign ?? null) && (x.group ?? null) === (u.group ?? null));
    if (existing) return existing;
    const row = { ...u, id: newId('use'), createdAt: now() };
    (await this.run('INSERT INTO intended_uses (id, source_id, collection_key, field, format, campaign, grp, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.id, row.sourceId, row.collection, row.field ?? null, row.format ?? null, row.campaign ?? null, row.group ?? null, row.createdBy, row.createdAt]));
    return row;
  }
  async removeIntendedUse(id: string) { (await this.run('UPDATE intended_uses SET removed_at = ? WHERE id = ?', [now(), id])); }

  // ---- extra languages (local only until the Sheet has a canonical column)
  async languages(): Promise<{ code: string; name: string; locale: string | null }[]> {
    return ((await this.all('SELECT code, name, locale FROM languages ORDER BY created_at', [])) as any[]).map((r) => ({ code: r.code, name: r.name, locale: r.locale }));
  }
  async addLanguage(code: string, name: string, locale: string | null) {
    (await this.run('INSERT INTO languages (code, name, locale, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING', [code, name, locale, now()]));
  }

  // ---- reversible verdicts
  async activeVerdicts(): Promise<FeedbackRow[]> { return (await this.listFeedback()).filter((f: any) => !f.supersededAt && !f.resolvedAt && f.verdict !== 'comment'); }
  async supersedeFeedback(id: string) { (await this.run('UPDATE feedback SET superseded_at = ? WHERE id = ? AND superseded_at IS NULL', [now(), id])); }
  async setFeedbackMeta(id: string, scope: object, language: string) { (await this.run('UPDATE feedback SET scope_json = ?, language = ? WHERE id = ?', [JSON.stringify(scope), language, id])); }

  // ---- comments
  async comments(): Promise<CommentRow[]> {
    return ((await this.all('SELECT * FROM comments ORDER BY created_at', [])) as any[]).map((r) => ({ id: r.id, comboKey: r.combo_key, combo: JSON.parse(r.combo_json), language: r.language, text: r.text,
      author: r.author, createdAt: r.created_at, editedAt: r.edited_at, deletedAt: r.deleted_at, resolvedAt: r.resolved_at }));
  }
  async addComment(c: { comboKey: string; combo: any; language: string; text: string; author: string }): Promise<string> {
    const id = newId('cm');
    (await this.run('INSERT INTO comments (id, combo_key, combo_json, language, text, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, c.comboKey, JSON.stringify(c.combo), c.language, c.text, c.author, now()]));
    return id;
  }
  async editComment(id: string, text: string) { (await this.run('UPDATE comments SET text = ?, edited_at = ? WHERE id = ? AND deleted_at IS NULL', [text, now(), id])); }
  async deleteComment(id: string) { (await this.run('UPDATE comments SET deleted_at = ? WHERE id = ?', [now(), id])); }
  async resolveComment(id: string, resolved: boolean) { (await this.run('UPDATE comments SET resolved_at = ? WHERE id = ?', [resolved ? now() : null, id])); }
}

export interface CollectionMeta { key: string; name: string | null; description: string | null; imageNote: string | null; formats: string[] | null; languages: string[] | null; details: { finalUrl?: string; path1?: string; path2?: string; cta?: string }; isLocal: boolean; createdAt?: string }
export interface IntendedUse { id: string; sourceId: string; collection: string; field: string | null; format: string | null; campaign: string | null; group: string | null; createdBy: string; createdAt: string }
export interface CommentRow { id: string; comboKey: string; combo: any; language: string; text: string; author: string; createdAt: string; editedAt: string | null; deletedAt: string | null; resolvedAt: string | null }
