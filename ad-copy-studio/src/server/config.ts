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
  /** Source IDs starting with this prefix are test items: never exported, never in campaign previews. */
  testIdPrefix: 'TEST',
};
