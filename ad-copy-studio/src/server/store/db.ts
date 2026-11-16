// SQLite database (Node's built-in node:sqlite). All SQL lives in src/server/store so a later move to a
// shared database (e.g. Postgres for private hosting) only replaces this folder.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  -- Every refresh of the workbook (successful or not).
  CREATE TABLE sheet_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
    ok INTEGER NOT NULL DEFAULT 0, error_kind TEXT, error_message TEXT,
    raw_json TEXT, fingerprint TEXT
  );

  -- A proposed change. kind: replace | variation | retire
  CREATE TABLE revisions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    source_id TEXT,               -- stable ID (existing items); proposed ID for variations
    language TEXT NOT NULL,       -- EN | DK | DE
    base_text TEXT NOT NULL,      -- Sheet wording the proposal started from ('' for variations)
    base_fp TEXT NOT NULL,        -- fingerprint of base_text
    base_read_id INTEGER,         -- sheet_reads.id the draft was based on
    proposed_text TEXT NOT NULL,
    english_basis TEXT NOT NULL,  -- English the translation is written against (= proposed text for EN)
    english_basis_fp TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    meta_json TEXT NOT NULL DEFAULT '{}',  -- family, asset type, intent, target groups, etc.
    state TEXT NOT NULL,          -- draft | submitted | changes_requested | approved | written | withdrawn | superseded
    sync_state TEXT NOT NULL DEFAULT 'none', -- none | pending | conflict | failed | written | local_only
    sync_detail TEXT NOT NULL DEFAULT '',
    is_test INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX revisions_item ON revisions(source_id, language);

  CREATE TABLE revision_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL,
    action TEXT NOT NULL, from_state TEXT, to_state TEXT, detail_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX revision_events_rev ON revision_events(revision_id);

  -- Approval of EXACT wording (+ the English it translates). revision_id NULL = "approve current wording as is".
  CREATE TABLE approvals (
    id TEXT PRIMARY KEY,
    revision_id TEXT, source_id TEXT NOT NULL, language TEXT NOT NULL,
    text TEXT NOT NULL, text_fp TEXT NOT NULL, english_text TEXT NOT NULL, english_fp TEXT NOT NULL,
    approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    revoked_at TEXT, revoked_reason TEXT
  );
  CREATE INDEX approvals_item ON approvals(source_id, language);

  -- Each attempt to write to the Sheet. idempotency_key = revision + approval.
  CREATE TABLE write_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id TEXT, purpose TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    mode TEXT NOT NULL, plan_json TEXT NOT NULL,
    status TEXT NOT NULL,         -- started | succeeded | already_applied | conflict | failed
    error_kind TEXT, error_message TEXT, verify_json TEXT,
    started_at TEXT NOT NULL, finished_at TEXT
  );

  -- Combination feedback, attached to the exact text versions shown.
  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    combo_key TEXT NOT NULL, combo_json TEXT NOT NULL,
    verdict TEXT NOT NULL,        -- works | needs_changes | comment
    reasons_json TEXT NOT NULL DEFAULT '[]', comment TEXT NOT NULL DEFAULT '',
    reviewer TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT
  );
  CREATE INDEX feedback_combo ON feedback(combo_key);

  -- Pinning proposals for Search previews (never applied to Google).
  CREATE TABLE pin_proposals (
    campaign TEXT NOT NULL, grp TEXT NOT NULL, source_id TEXT NOT NULL, position TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (campaign, grp, source_id)
  );

  -- Anabelle's acknowledgement that she applied wording in Google Ads (not verified by the app).
  CREATE TABLE acknowledgements (
    id TEXT PRIMARY KEY,
    revision_id TEXT, source_id TEXT NOT NULL, language TEXT NOT NULL,
    applied_text TEXT NOT NULL, applied_fp TEXT NOT NULL, acknowledged_by TEXT NOT NULL, acknowledged_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    reference_state TEXT NOT NULL DEFAULT 'not_advanced', -- not_advanced | advanced | failed | conflict
    reference_detail TEXT NOT NULL DEFAULT '', reference_at TEXT
  );

  CREATE TABLE export_batches (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
    mode TEXT NOT NULL, filters_json TEXT NOT NULL, items_json TEXT NOT NULL,
    csv TEXT NOT NULL, row_count INTEGER NOT NULL, label TEXT NOT NULL
  );
  `,
];

let db: DatabaseSync | null = null;
let dbPath = '';

export function openDb(file: string): DatabaseSync {
  mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  d.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const row = d.prepare('SELECT v FROM schema_version').get() as { v: number } | undefined;
  let v = row?.v ?? 0;
  if (!row) d.prepare('INSERT INTO schema_version (v) VALUES (0)').run();
  while (v < MIGRATIONS.length) {
    d.exec('BEGIN');
    try {
      d.exec(MIGRATIONS[v]);
      v += 1;
      d.prepare('UPDATE schema_version SET v = ?').run(v);
      d.exec('COMMIT');
    } catch (e) { d.exec('ROLLBACK'); throw e; }
  }
  return d;
}

export function getDb(file: string): DatabaseSync {
  if (!db || dbPath !== file) { db?.close(); db = openDb(file); dbPath = file; }
  return db;
}

export function tx<T>(d: DatabaseSync, fn: () => T): T {
  d.exec('BEGIN IMMEDIATE');
  try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; }
}
