// Move your local studio data (Mac) into the online database, once.
// Usage:  DATABASE_URL="postgresql://…" npm run import:supabase -- "/path/to/La-Cabra-Studio-Data/studio.db" [--replace]
import { importSqliteToPostgres } from '../src/server/store/importer';
import { openPostgres } from '../src/server/store/pg';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const replace = process.argv.includes('--replace');
const url = process.env.DATABASE_URL;
if (!file || !url) {
  console.error('Usage: DATABASE_URL="postgresql://…" npm run import:supabase -- /path/to/studio.db [--replace]');
  process.exit(1);
}
(async () => {
  const pg = await openPostgres(url, process.env.STUDIO_DB_SCHEMA || 'ad_studio', { max: 1 });
  try {
    const counts = await importSqliteToPostgres(file, pg, { replace });
    console.log('Imported and verified:');
    for (const [t, n] of Object.entries(counts)) if (n) console.log(`  ${t}: ${n}`);
    console.log('Your local file was not changed (apart from its usual upgrade, which made a backup first).');
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally { await pg.close(); }
})();
