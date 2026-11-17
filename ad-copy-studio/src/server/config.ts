// Central configuration (server-side only). Values come from environment variables / .env.local.
import path from 'node:path';
import os from 'node:os';

const env = process.env;

export const config = {
  spreadsheetId: env.GOOGLE_SHEET_ID || '1Kt4x-vf3oDdrQplwE7yW6TrDfTvtm55mOJK3yCpWvFo',
  googleAuthMode: (env.GOOGLE_AUTH_MODE === 'service_account' ? 'service_account' : 'oauth') as 'oauth' | 'service_account',
  oauthClientId: env.GOOGLE_OAUTH_CLIENT_ID || '',
  oauthClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  serviceAccountKeyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '',
  googleAccess: (env.GOOGLE_ACCESS === 'readonly' ? 'readonly' : 'readwrite') as 'readonly' | 'readwrite',
  // Outside the project folder by default: survives reinstalls, cannot be committed by accident, and
  // does not trigger the dev server's file watcher.
  dataDir: path.resolve(env.STUDIO_DATA_DIR || path.join(os.homedir(), '.la-cabra-ad-copy-studio')),
  /** Optional override of the starting connection mode: google | snapshot | sandbox */
  forcedMode: env.SHEET_MODE as 'google' | 'snapshot' | 'sandbox' | undefined,
  /** Extra host names the server may answer on (comma-separated, or * for any). Default: localhost only.
   *  Only for previewing in a trusted remote environment; writes still require same-origin requests. */
  allowedHosts: (env.STUDIO_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
  /** Real writes to the live Sheet stay OFF until a fresh live read, conflict check and an explicitly authorised,
   *  labelled test have been done. Set STUDIO_LIVE_WRITES=enabled only after that test (see README). */
  liveWritesEnabled: env.STUDIO_LIVE_WRITES === 'enabled',
  // ---- Hosted (online) version. Setting DATABASE_URL switches storage to Postgres (Supabase) and turns on sign-in.
  databaseUrl: env.DATABASE_URL || '',
  dbSchema: env.STUDIO_DB_SCHEMA || 'ad_studio',
  get hosted() { return !!(env.DATABASE_URL); },
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  /** Who may sign in online: Google accounts on these domains, plus these named addresses. */
  allowedEmailDomains: (env.STUDIO_ALLOWED_EMAIL_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
  allowedEmails: (env.STUDIO_ALLOWED_EMAILS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  /** Service-account key as JSON text (hosted alternative to a key file). */
  serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  /** Source IDs starting with this prefix are test items: never exported, never in campaign previews. */
  testIdPrefix: 'TEST',
};
