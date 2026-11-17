// The storage driver. The repository talks only to this interface, so the same code runs on
//  - SQLite (node:sqlite) for the local Mac version and the tests, and
//  - PostgreSQL (Supabase) for the hosted version.
// SQL is written with `?` placeholders; the Postgres driver numbers them ($1, $2, …).
import { AsyncLocalStorage } from 'node:async_hooks';

export interface Sql {
  dialect: 'sqlite' | 'pg';
  all(sql: string, params?: unknown[]): Promise<any[]>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const norm = (p: unknown[]) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)) as any[];

/** Serialises transactions on a single SQLite connection; other queries wait while one is open. */
class Gate {
  private tail: Promise<unknown> = Promise.resolve();
  readonly als = new AsyncLocalStorage<boolean>();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => { release = r; });
    await prev;
    try { return await this.als.run(true, fn); } finally { release(); }
  }
  async idle() { if (!this.als.getStore()) await this.tail; }
}

export function sqliteDriver(db: import('node:sqlite').DatabaseSync): Sql {
  const gate = new Gate();
  return {
    dialect: 'sqlite',
    async all(sql, params = []) { await gate.idle(); return db.prepare(sql).all(...norm(params)) as any[]; },
    async exec(sql) { await gate.idle(); db.exec(sql); },
    tx(fn) {
      if (gate.als.getStore()) return fn(); // nested: join the outer transaction
      return gate.run(async () => {
        db.exec('BEGIN IMMEDIATE');
        try { const r = await fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
      });
    },
    async close() { db.close(); },
  };
}

function numbered(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => { i += 1; return '$' + i; });
}

/** PostgreSQL via node-postgres. Each transaction gets its own pooled client. `prepare` runs once per new
 *  connection before any other query on it (e.g. setting the schema), so it never overlaps a query. */
export function pgDriver(pool: import('pg').Pool, prepare?: string): Sql {
  const als = new AsyncLocalStorage<import('pg').PoolClient>();
  const ready = new WeakSet<object>();
  const acquire = async () => {
    const c = await pool.connect();
    if (prepare && !ready.has(c)) { await c.query(prepare); ready.add(c); }
    return c;
  };
  const q = async (sql: string, params: unknown[]) => {
    const inTx = als.getStore();
    if (inTx) return (await inTx.query(numbered(sql), norm(params))).rows;
    const c = await acquire();
    try { return (await c.query(numbered(sql), norm(params))).rows; } finally { c.release(); }
  };
  return {
    dialect: 'pg',
    all: (sql, params = []) => q(sql, params),
    async exec(sql) {
      const inTx = als.getStore();
      if (inTx) { await inTx.query(sql); return; }
      const c = await acquire();
      try { await c.query(sql); } finally { c.release(); }
    },
    async tx(fn) {
      if (als.getStore()) return fn();
      const client = await acquire();
      try {
        await client.query('BEGIN');
        const r = await als.run(client, fn);
        await client.query('COMMIT');
        return r;
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
      finally { client.release(); }
    },
    async close() { await pool.end(); },
  };
}
