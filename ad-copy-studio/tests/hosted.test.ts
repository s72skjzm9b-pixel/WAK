// Hosted-version pieces: data import into Postgres, the sign-in allowlist.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { copyFileSync } from 'node:fs';
import { tmpDir, PG_URL, seed } from './helpers';
import { isAllowedEmail } from '@/server/auth/access';
import { importSqliteToPostgres } from '@/server/store/importer';
import { openPostgres } from '@/server/store/pg';
import { Repo } from '@/server/store/repo';
import { Studio } from '@/server/domain/studio';
import { SnapshotGateway } from '@/server/sheets/snapshot';
import { workspaceView } from '@/server/domain/workspace';

describe('sign-in allowlist', () => {
  it('allows La Cabra accounts and named people only', () => {
    expect(isAllowedEmail('anabelle@lacabra.com', ['lacabra.com'], [])).toBe(true);
    expect(isAllowedEmail('Christian@LaCabra.com', ['lacabra.com'], [])).toBe(true);
    expect(isAllowedEmail('someone@gmail.com', ['lacabra.com'], [])).toBe(false);
    expect(isAllowedEmail('freelancer@gmail.com', ['lacabra.com'], ['freelancer@gmail.com'])).toBe(true);
    expect(isAllowedEmail('x@lacabra.com.evil.com', ['lacabra.com'], [])).toBe(false);
    expect(isAllowedEmail(null, ['lacabra.com'], [])).toBe(false);
    expect(isAllowedEmail('a@lacabra.com', [], [])).toBe(false); // nothing configured = nobody
  });
});

describe.skipIf(!PG_URL)('moving local data to Supabase (Postgres)', () => {
  it('copies everything in one verified step and the online studio shows it', async () => {
    const dir = tmpDir();
    copyFileSync(path.join(__dirname, 'fixtures', 'legacy-v1.db'), path.join(dir, 'studio.db'));
    const schema = 'imp_' + Date.now().toString(36);
    const pg = await openPostgres(PG_URL, schema, { max: 2 });
    const counts = await importSqliteToPostgres(path.join(dir, 'studio.db'), pg);
    expect(counts.revisions).toBe(5);
    expect(counts.comments).toBe(4);
    // A second import into a non-empty database is refused.
    await expect(importSqliteToPostgres(path.join(dir, 'studio.db'), pg)).rejects.toThrow(/already holds/);
    const studio = await new Studio(new Repo(pg), { snapshot: () => new SnapshotGateway(seed()) }, 'snapshot').init();
    const v = await workspaceView(studio);
    expect(v.suggestions.find((s) => s.proposedText === 'Seasonal Coffee from Mexico')?.collection).toBe('online-coffee');
    expect(v.comments.map((c) => c.text)).toEqual(expect.arrayContaining(['Nice origin story', 'Sæson gentages']));
    // New work after the move gets fresh IDs (sequences continue after imported rows).
    const id = await studio.repo.startRead('snapshot');
    expect(id).toBeGreaterThan(0);
    await pg.close();
  });

  it('locks the tables against Supabase’s public API roles', async () => {
    const schema = 'lock_' + Date.now().toString(36);
    const admin = await openPostgres(PG_URL, 'public', { max: 1 });
    await admin.exec("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;");
    await admin.exec(`GRANT USAGE ON SCHEMA public TO anon`);
    const pg = await openPostgres(PG_URL, schema, { max: 1 });
    const rls = await pg.all("SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND relkind = 'r' AND relname = 'revisions'");
    expect(rls[0].relrowsecurity).toBe(true);
    const priv = await pg.all("SELECT has_schema_privilege('anon', current_schema(), 'USAGE') AS u");
    expect(priv[0].u).toBe(false);
    await pg.close(); await admin.close();
  });
});
