// Minimal stand-in for Supabase Auth's "who is this token?" endpoint, for testing the online sign-in gate.
import http from 'node:http';
const USERS = {
  'good-token': { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'christian@lacabra.com', user_metadata: { full_name: 'Christian Test' } },
  'other-token': { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'someone@gmail.com', user_metadata: { full_name: 'Someone' } },
};
export function startMockAuth(port) {
  const server = http.createServer((req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (req.url?.startsWith('/auth/v1/user') && USERS[token]) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(USERS[token])); return; }
    res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: 401, msg: 'invalid token' }));
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}
/** The cookie @supabase/ssr reads: sb-<ref>-auth-token = "base64-" + base64url(session JSON). */
export function sessionCookie(supabaseUrl, token) {
  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  const user = USERS[token] ?? { id: 'x', email: 'x@x' };
  const session = { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  return { name: `sb-${ref}-auth-token`, value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url') };
}
