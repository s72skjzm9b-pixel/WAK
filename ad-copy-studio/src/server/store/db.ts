// SQLite database (Node's built-in node:sqlite). All SQL lives in src/server/store so a later move to a
// shared database (e.g. Postgres for private hosting) only replaces this folder.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { sqliteDriver } from './sql';

type Migration = string | { sql: string; data?: (d: DatabaseSync) => void };

const MIGRATIONS: Migration[] = [
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
  // v2 (Nov 2026): lifecycle, intended uses, collection briefs, extra languages, reversible feedback, comments.
  // Additive only — the previous build can still open a migrated database. A backup is taken first.
  {
    sql: `
    ALTER TABLE revisions ADD COLUMN ready_at TEXT;
    ALTER TABLE revisions ADD COLUMN applied_at TEXT;
    ALTER TABLE revisions ADD COLUMN applied_by TEXT;
    ALTER TABLE revisions ADD COLUMN archived_at TEXT;
    CREATE TABLE collections_meta (
      key TEXT PRIMARY KEY, name TEXT, description TEXT, image_note TEXT, formats_json TEXT, languages_json TEXT,
      details_json TEXT, is_local INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE intended_uses (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, collection_key TEXT NOT NULL, field TEXT, format TEXT, campaign TEXT, grp TEXT,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, removed_at TEXT
    );
    CREATE INDEX intended_uses_src ON intended_uses(source_id);
    CREATE TABLE languages (code TEXT PRIMARY KEY, name TEXT NOT NULL, locale TEXT, created_at TEXT NOT NULL);
    CREATE TABLE comments (
      id TEXT PRIMARY KEY, combo_key TEXT NOT NULL, combo_json TEXT NOT NULL, language TEXT NOT NULL, text TEXT NOT NULL,
      author TEXT NOT NULL, created_at TEXT NOT NULL, edited_at TEXT, deleted_at TEXT, resolved_at TEXT, legacy_feedback_id TEXT
    );
    ALTER TABLE feedback ADD COLUMN superseded_at TEXT;
    ALTER TABLE feedback ADD COLUMN scope_json TEXT NOT NULL DEFAULT '{"kind":"combination"}';
    ALTER TABLE feedback ADD COLUMN language TEXT;
    `,
    data: (d) => {
      const now = new Date().toISOString();
      // Feedback: language becomes part of identity; comments move to their own table; only the latest
      // verdict per exact combination stays active (older ones are kept as history).
      const rows = d.prepare('SELECT * FROM feedback ORDER BY created_at').all() as any[];
      const latest = new Map<string, any>();
      for (const f of rows) {
        const combo = JSON.parse(f.combo_json);
        d.prepare('UPDATE feedback SET language = ? WHERE id = ?').run(combo.language ?? 'EN', f.id);
        if (f.comment && String(f.comment).trim()) {
          d.prepare('INSERT INTO comments (id, combo_key, combo_json, language, text, author, created_at, resolved_at, legacy_feedback_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run('cm_' + f.id.replace(/^fb_/, ''), f.combo_key, f.combo_json, combo.language ?? 'EN', f.comment, f.reviewer, f.created_at, f.resolved_at, f.id);
        }
        if (f.verdict === 'comment') { d.prepare('UPDATE feedback SET superseded_at = ? WHERE id = ?').run(f.created_at, f.id); continue; }
        const ident = [combo.format, combo.language, ...(combo.slots ?? []).map((s: any) => `${s.slot}=${s.sourceId}:${s.text}`)].join('|');
        const prev = latest.get(ident);
        if (prev) d.prepare('UPDATE feedback SET superseded_at = ? WHERE id = ?').run(f.created_at, prev.id);
        latest.set(ident, f);
      }
      // Proposals that were deliberately submitted are "Ready for review".
      d.prepare("UPDATE revisions SET ready_at = updated_at WHERE state IN ('submitted', 'approved', 'written')").run();
      // Anabelle's earlier "applied" confirmations.
      for (const a of d.prepare("SELECT * FROM acknowledgements WHERE reference_state = 'advanced' AND revision_id IS NOT NULL").all() as any[]) {
        d.prepare('UPDATE revisions SET applied_at = ?, applied_by = ? WHERE id = ?').run(a.reference_at ?? a.acknowledged_at, a.acknowledged_by, a.revision_id);
      }
      // Earlier variation drafts that named campaign groups keep that as explicit studio intent.
      for (const r of d.prepare("SELECT id, source_id, meta_json, created_by, created_at FROM revisions WHERE kind = 'variation' AND language = 'EN'").all() as any[]) {
        const meta = JSON.parse(r.meta_json);
        for (const t of meta.targets ?? []) {
          d.prepare('INSERT INTO intended_uses (id, source_id, collection_key, field, format, campaign, grp, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(`use_${r.id}_${t.campaign}_${t.group}`.replace(/[^\w]/g, '_'), r.source_id, '', meta.assetType ?? null, null, t.campaign, t.group, r.created_by, r.created_at);
        }
      }
      void now;
    },
  },
  // v3: key/value storage used by the hosted version (kept identical locally).
  `CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);`,
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
  if (v > 0 && v < MIGRATIONS.length && file !== ':memory:') {
    // Safety copy before changing an existing database. Restoring it reverses the migration.
    const dir = path.join(path.dirname(file), 'backups');
    mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `before-migration-v${v + 1}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    d.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }
  while (v < MIGRATIONS.length) {
    d.exec('BEGIN');
    try {
      const m = MIGRATIONS[v];
      if (typeof m === 'string') d.exec(m); else { d.exec(m.sql); m.data?.(d); }
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

/** @deprecated synchronous helper kept for the import script */
export function tx<T>(d: DatabaseSync, fn: () => T): T {
  d.exec('BEGIN IMMEDIATE');
  try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; }
}

/** The local (Mac) storage: SQLite file with migrations, behind the async driver. */
export function openSqliteSql(file: string) {
  return sqliteDriver(openDb(file));
}
