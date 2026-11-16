// Copies the local database (consistent snapshot via VACUUM INTO) and the sandbox workbook into
// <data dir>/backups/<timestamp>/. Usage: npm run backup [-- /path/to/destination]
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dataDir = path.resolve(process.env.STUDIO_DATA_DIR || path.join(os.homedir(), '.la-cabra-ad-copy-studio'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.resolve(process.argv[2] || path.join(dataDir, 'backups', stamp));
mkdirSync(dest, { recursive: true });
const dbFile = path.join(dataDir, 'studio.db');
if (!existsSync(dbFile)) { console.error(`No database at ${dbFile}`); process.exit(1); }
const db = new DatabaseSync(dbFile);
db.exec(`VACUUM INTO '${path.join(dest, 'studio.db').replace(/'/g, "''")}'`);
db.close();
const sandbox = path.join(dataDir, 'sandbox-workbook.json');
if (existsSync(sandbox)) copyFileSync(sandbox, path.join(dest, 'sandbox-workbook.json'));
console.log(`Backup written to ${dest}\n(OAuth tokens in ${path.join(dataDir, 'secrets')} are deliberately not copied.)`);
