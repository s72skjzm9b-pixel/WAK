// Server-side Google authorization. Tokens and keys never leave the server process: they are stored
// under the data directory (gitignored, file mode 0600) and are never logged or sent to the browser.
import 'server-only';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { OAuth2Client, GoogleAuth, CodeChallengeMethod } from 'google-auth-library';
import { config } from '../config';
import { SheetError } from '../sheets/gateway';

export function scopes(): string[] {
  return [config.googleAccess === 'readonly'
    ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
    : 'https://www.googleapis.com/auth/spreadsheets'];
}

const tokenFile = () => path.join(config.dataDir, 'secrets', 'google-oauth-token.json');
const pendingFile = () => path.join(config.dataDir, 'secrets', 'oauth-pending.json');

function writeSecret(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort on non-POSIX */ }
}

export type AuthStatus =
  | { state: 'not_configured'; detail: string }
  | { state: 'needs_sign_in'; detail: string }
  | { state: 'ready'; detail: string; account?: string };

export function authStatus(): AuthStatus {
  if (config.googleAuthMode === 'service_account') {
    if (!config.serviceAccountKeyFile) return { state: 'not_configured', detail: 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set.' };
    if (!existsSync(config.serviceAccountKeyFile)) return { state: 'not_configured', detail: 'The service account key file was not found.' };
    try {
      const email = JSON.parse(readFileSync(config.serviceAccountKeyFile, 'utf8')).client_email as string;
      return { state: 'ready', detail: 'Service account', account: email };
    } catch { return { state: 'not_configured', detail: 'The service account key file could not be read.' }; }
  }
  if (!config.oauthClientId || !config.oauthClientSecret) {
    return { state: 'not_configured', detail: 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set in .env.local.' };
  }
  if (!existsSync(tokenFile())) return { state: 'needs_sign_in', detail: 'Sign in with Google to connect the workbook.' };
  const t = JSON.parse(readFileSync(tokenFile(), 'utf8'));
  return { state: 'ready', detail: 'Signed in with Google (OAuth)', account: t.account };
}

function oauthClient(redirectUri: string) {
  return new OAuth2Client({ clientId: config.oauthClientId, clientSecret: config.oauthClientSecret, redirectUri });
}

export async function beginOAuth(redirectUri: string): Promise<string> {
  const client = oauthClient(redirectUri);
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = crypto.randomBytes(16).toString('hex');
  writeSecret(pendingFile(), { state, codeVerifier, redirectUri, at: Date.now() });
  return client.generateAuthUrl({
    access_type: 'offline', prompt: 'consent', scope: [...scopes(), 'openid', 'email'], state,
    code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256, include_granted_scopes: false,
  });
}

export async function completeOAuth(code: string, state: string): Promise<void> {
  if (!existsSync(pendingFile())) throw new SheetError('auth_required', 'No sign-in was in progress. Start again from the Connection page.');
  const pending = JSON.parse(readFileSync(pendingFile(), 'utf8'));
  rmSync(pendingFile(), { force: true });
  if (pending.state !== state || Date.now() - pending.at > 10 * 60_000) throw new SheetError('auth_required', 'Sign-in expired or did not match. Please try again.');
  const client = oauthClient(pending.redirectUri);
  const { tokens } = await client.getToken({ code, codeVerifier: pending.codeVerifier });
  if (!tokens.refresh_token) throw new SheetError('auth_required', 'Google did not return a refresh token. Remove the app from your Google account permissions and sign in again.');
  let account: string | undefined;
  if (tokens.id_token) {
    try { account = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()).email; } catch { /* optional */ }
  }
  writeSecret(tokenFile(), { refresh_token: tokens.refresh_token, scope: tokens.scope, account, savedAt: new Date().toISOString() });
}

export function signOut() {
  rmSync(tokenFile(), { force: true });
}

/** Returns a fresh access token or throws a SheetError describing what the user must do. */
export async function getAccessToken(): Promise<string> {
  const st = authStatus();
  if (st.state === 'not_configured') throw new SheetError('not_configured', st.detail);
  if (st.state === 'needs_sign_in') throw new SheetError('auth_required', st.detail);
  try {
    if (config.googleAuthMode === 'service_account') {
      const auth = new GoogleAuth({ keyFile: config.serviceAccountKeyFile, scopes: scopes() });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('No token');
      return token;
    }
    const saved = JSON.parse(readFileSync(tokenFile(), 'utf8'));
    const client = oauthClient('http://localhost');
    client.setCredentials({ refresh_token: saved.refresh_token });
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('No token');
    return token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/invalid_grant|expired|revoked/i.test(msg)) {
      throw new SheetError('auth_expired', 'Google authorization has expired or was revoked. Sign in again on the Connection page.');
    }
    if (/ENOTFOUND|ECONN|ETIMEDOUT|fetch failed/i.test(msg)) throw new SheetError('network', 'Could not reach Google to refresh authorization.', true);
    throw new SheetError('unknown', 'Could not obtain Google authorization.');
  }
}
