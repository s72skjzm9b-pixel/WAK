// Process-wide Studio instance (survives dev hot reloads via globalThis).
import 'server-only';
import path from 'node:path';
import { config } from './config';
import { getDb } from './store/db';
import { Repo } from './store/repo';
import { Studio } from './domain/studio';
import { SnapshotGateway, loadSnapshotFile } from './sheets/snapshot';
import { SandboxGateway } from './sheets/sandbox';
import { GoogleSheetsGateway } from './google/sheetsApi';
import { authStatus } from './google/auth';
import type { GatewayMode, SheetGateway } from './sheets/gateway';

const g = globalThis as unknown as { __studio?: Studio; __gw?: Partial<Record<GatewayMode, SheetGateway>> };

export function getStudio(): Studio {
  if (g.__studio) return g.__studio;
  const repo = new Repo(getDb(path.join(config.dataDir, 'studio.db')));
  g.__gw ??= {};
  const cache = g.__gw;
  const gateways: Partial<Record<GatewayMode, () => SheetGateway>> = {
    google: () => (cache.google ??= new GoogleSheetsGateway()),
    snapshot: () => (cache.snapshot ??= new SnapshotGateway()),
    sandbox: () => (cache.sandbox ??= new SandboxGateway(loadSnapshotFile(), path.join(config.dataDir, 'sandbox-workbook.json'))),
  };
  const auth = authStatus();
  const defaultMode: GatewayMode = config.forcedMode ?? (auth.state === 'not_configured' ? 'snapshot' : 'google');
  g.__studio = new Studio(repo, gateways, defaultMode);
  return g.__studio;
}
