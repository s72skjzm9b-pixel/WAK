// Process-wide Studio instance (survives dev hot reloads and warm serverless invocations via globalThis).
// Local (Mac): SQLite file in the data folder. Hosted: Postgres (Supabase) when DATABASE_URL is set.
import 'server-only';
import path from 'node:path';
import { config } from './config';
import { Repo } from './store/repo';
import { Studio } from './domain/studio';
import { SnapshotGateway, loadSnapshotFile } from './sheets/snapshot';
import { SandboxGateway } from './sheets/sandbox';
import { GoogleSheetsGateway } from './google/sheetsApi';
import { authStatus } from './google/auth';
import type { GatewayMode, SheetGateway } from './sheets/gateway';

const g = globalThis as unknown as { __studio?: Promise<Studio>; __gw?: Partial<Record<GatewayMode, SheetGateway>> };

async function create(): Promise<Studio> {
  let repo: Repo;
  if (config.hosted) {
    const { openPostgres } = await import('./store/pg');
    repo = new Repo(await openPostgres(config.databaseUrl, config.dbSchema));
  } else {
    const { openSqliteSql } = await import('./store/db');
    repo = new Repo(openSqliteSql(path.join(config.dataDir, 'studio.db')));
  }
  g.__gw ??= {};
  const cache = g.__gw;
  const gateways: Partial<Record<GatewayMode, () => SheetGateway>> = {
    google: () => (cache.google ??= new GoogleSheetsGateway()),
    snapshot: () => (cache.snapshot ??= new SnapshotGateway()),
    sandbox: () => (cache.sandbox ??= config.hosted
      ? new SandboxGateway(loadSnapshotFile(), null, { load: () => repo.getBlob('sandbox-workbook'), save: (v) => repo.setBlob('sandbox-workbook', v) })
      : new SandboxGateway(loadSnapshotFile(), path.join(config.dataDir, 'sandbox-workbook.json'))),
  };
  const auth = authStatus();
  const defaultMode: GatewayMode = config.forcedMode ?? (auth.state === 'not_configured' ? 'snapshot' : 'google');
  return new Studio(repo, gateways, defaultMode).init();
}

export function getStudio(): Promise<Studio> {
  g.__studio ??= create().catch((e) => { g.__studio = undefined; throw e; });
  return g.__studio;
}
