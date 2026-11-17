// One-time move of the local studio database (SQLite on the Mac) into the hosted database (Supabase Postgres).
// Everything is copied in ONE transaction and verified by row counts; a non-empty target is refused unless
// `replace` is set. The local file is first upgraded (with its own automatic backup) so columns match.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb } from './db';
import type { Sql } from './sql';

export const TABLES = ['settings', 'sheet_reads', 'revisions', 'revision_events', 'approvals', 'write_attempts', 'feedback', 'pin_proposals',
  'acknowledgements', 'export_batches', 'collections_meta', 'intended_uses', 'languages', 'comments', 'blobs'] as const;
const IDENTITY = new Set(['sheet_reads', 'revision_events', 'write_attempts']);

export async function importSqliteToPostgres(sqliteFile: string, pg: Sql, opts: { replace?: boolean; schema?: string } = {}) {
  if (!existsSync(sqliteFile)) throw new Error(`No database at ${sqliteFile}`);
  const local = openDb(sqliteFile);
  try {
    const existing = Number((await pg.all('SELECT (SELECT count(*) FROM revisions) + (SELECT count(*) FROM feedback) + (SELECT count(*) FROM comments) AS n'))[0].n);
    if (existing > 0 && !opts.replace) throw new Error(`The online database already holds ${existing} drafts/feedback/comments. Nothing was imported. Re-run with --replace to overwrite it (export a backup first).`);
    const counts: Record<string, number> = {};
    await pg.tx(async () => {
      if (opts.replace) for (const t of [...TABLES].reverse()) await pg.exec(`DELETE FROM ${t}`);
      for (const t of TABLES) {
        const rows = local.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
        const pgCols = new Set((await pg.all('SELECT column_name FROM information_schema.columns WHERE table_name = ? AND table_schema = current_schema()', [t])).map((r: any) => r.column_name));
        for (const r of rows) {
          const cols = Object.keys(r).filter((c) => pgCols.has(c));
          await pg.all(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => r[c]));
        }
        if (IDENTITY.has(t) && rows.length) await pg.all(`SELECT setval(pg_get_serial_sequence(current_schema() || '.${t}', 'id'), (SELECT max(id) FROM ${t}))`);
        counts[t] = rows.length;
      }
      // The local practice copy lives in a file; online it lives in the database.
      const sandbox = path.join(path.dirname(sqliteFile), 'sandbox-workbook.json');
      if (existsSync(sandbox) && !(local.prepare("SELECT 1 FROM blobs WHERE key = 'sandbox-workbook'").get())) {
        await pg.all("INSERT INTO blobs (key, value, updated_at) VALUES ('sandbox-workbook', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [readFileSync(sandbox, 'utf8'), new Date().toISOString()]);
      }
      // Verify inside the transaction: any mismatch rolls everything back.
      for (const t of TABLES) {
        const n = Number((await pg.all(`SELECT count(*) AS n FROM ${t}`))[0].n);
        const expected = counts[t] + (t === 'blobs' && existsSync(sandbox) ? (n - counts[t]) : 0);
        if (n !== expected) throw new Error(`Verification failed for ${t}: expected ${expected}, found ${n}. Nothing was imported.`);
      }
    });
    return counts;
  } finally { local.close(); }
}
