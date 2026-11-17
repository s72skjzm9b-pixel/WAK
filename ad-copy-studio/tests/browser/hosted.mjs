// Online version, end to end: Postgres storage + the sign-in gate (with a stand-in for Supabase Auth).
// Needs: a production build made with the NEXT_PUBLIC_* values below, and STUDIO_TEST_PG.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startMockAuth, sessionCookie } from './mock-supabase-auth.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT = 3198, B = `http://localhost:${PORT}`, AUTH = 'http://127.0.0.1:54398';
const PG = process.env.STUDIO_TEST_PG;
let server, mock, browser;

before(async () => {
  mock = await startMockAuth(54398);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(PORT)], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: PG, STUDIO_DB_SCHEMA: 'hosted_e2e_' + Date.now().toString(36), NEXT_PUBLIC_SUPABASE_URL: AUTH, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon', STUDIO_ALLOWED_EMAIL_DOMAINS: 'lacabra.com', SHEET_MODE: 'snapshot' },
  });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`${B}/api/health`); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); mock?.close(); });

async function as(token) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (token) { const c = sessionCookie(AUTH, token); await ctx.addCookies([{ name: c.name, value: c.value, domain: 'localhost', path: '/' }]); }
  await ctx.addInitScript(() => { try { localStorage.setItem('ws.introDismissed', '1'); } catch {} });
  return ctx;
}

test('signed out: pages go to the sign-in page and the API refuses', async () => {
  const ctx = await as(null); const page = await ctx.newPage();
  await page.goto(B + '/');
  assert.match(page.url(), /\/login$/);
  await page.getByRole('button', { name: 'Sign in with Google' }).waitFor();
  const r = await fetch(B + '/api/workspace');
  assert.equal(r.status, 401);
  await ctx.close();
});

test('a Google account outside La Cabra is turned away', async () => {
  const ctx = await as('other-token'); const page = await ctx.newPage();
  await page.goto(B + '/');
  assert.match(page.url(), /\/login\?denied=1$/);
  await page.getByText('doesn’t have access').waitFor();
  const r = await page.request.get(B + '/api/workspace');
  assert.equal(r.status(), 401);
  await ctx.close();
});

test('a La Cabra account works end to end on Postgres, and edits are recorded under that name', async () => {
  const ctx = await as('good-token'); const page = await ctx.newPage();
  await page.goto(B + '/');
  await page.getByRole('heading', { name: 'Coffee', exact: true }).waitFor({ timeout: 20000 });
  await page.getByText('Christian Test').first().waitFor();
  const f = page.locator('textarea[aria-label="English headline: Coffees with a sense of place"]');
  await f.fill('Coffees with a sense of origin'); await f.blur();
  await page.getByText('Draft saved locally').waitFor();
  const v = await (await page.request.get(B + '/api/workspace')).json();
  const s = v.suggestions.find((x) => x.sourceId === 'G04');
  assert.equal(s.proposedText, 'Coffees with a sense of origin');
  assert.match(s.createdBy, /Christian Test/);
  // Feedback works without asking for a name (the account is the name).
  await page.locator('.excard').first().getByRole('button', { name: /^Works — example 1$/ }).click();
  await page.waitForTimeout(600);
  const fb = await (await page.request.get(B + '/api/feedback')).json();
  assert.ok(fb.feedback.some((x) => x.reviewer === 'Christian Test' && x.verdict === 'works'));
  // Cross-site writes are refused even with a valid session.
  const bad = await page.request.put(B + '/api/suggestions', { headers: { origin: 'https://evil.example', 'x-studio-client': '1', 'content-type': 'application/json' }, data: { sourceId: 'G01', language: 'EN', text: 'x' } });
  assert.equal(bad.status(), 403);
  await ctx.close();
});
