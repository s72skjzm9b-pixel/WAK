// Browser tests against the production build, using a copy of the reproduced user data.
// Run: npm run build && npm run test:browser
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT = 3199, B = `http://localhost:${PORT}`;
let server, browser, dir;

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'studio-browser-'));
  copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'legacy-v1.db'), path.join(dir, 'studio.db'));
  const d = new DatabaseSync(path.join(dir, 'studio.db'));
  d.prepare("INSERT INTO settings(key, value) VALUES('mode', 'snapshot') ON CONFLICT(key) DO UPDATE SET value = 'snapshot'").run();
  d.close();
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: ROOT, env: { ...process.env, STUDIO_DATA_DIR: dir }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`${B}/api/status`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function open(viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => { try { localStorage.setItem('studio.name', 'Tester'); localStorage.setItem('ws.introDismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(B + '/');
  await page.getByRole('heading', { name: 'Coffee', exact: true }).waitFor({ timeout: 20000 });
  return page;
}
const api = async (p) => (await fetch(B + p)).json();
const field = (page, label) => page.locator(`textarea[aria-label^="${label}"]`).first();

test('opens on useful copy and examples; existing “Seasonal Coffee from Mexico” survives; IDs hidden', async () => {
  const page = await open();
  const row = page.locator('.copyrow', { has: page.locator('textarea[aria-label="English headline (new)"]') }).filter({ has: page.locator('textarea:text-is("Seasonal Coffee from Mexico")') });
  const values = await page.locator('textarea[aria-label$="headline (new)"]').evaluateAll((els) => els.map((e) => e.value));
  assert.ok(values.includes('Seasonal Coffee from Mexico'), 'English kept');
  assert.ok(values.includes('Sæsonkaffe fra Mexico'), 'Danish translation kept');
  void row;
  assert.ok(await page.locator('.excard').count() > 0, 'examples visible immediately');
  assert.equal(((await page.locator('.ws-copy').innerText()).match(/\b(G\d\d|NEW-\d+)\b/g) ?? []).length, 0, 'no source IDs in the main workspace');
  await page.context().close();
});

test('autosave: failure shows Retry with an associated field error, and nothing is lost', async () => {
  const page = await open();
  await page.route('**/api/suggestions', (r) => r.abort());
  const f = field(page, 'English headline: Coffees with a sense of place');
  await f.fill('Coffees with a sense of origin');
  await f.blur();
  await page.getByText('Could not save').first().waitFor();
  const described = await f.getAttribute('aria-describedby');
  assert.match(described, /err-/, 'error is associated with the field');
  assert.equal(await page.locator(`#${described.split(' ').find((x) => x.startsWith('err-'))}`).count(), 1);
  await page.unroute('**/api/suggestions');
  await page.getByRole('button', { name: 'Retry' }).first().click();
  await page.getByText('Draft saved locally').waitFor();
  const v = await api('/api/workspace');
  assert.ok(v.suggestions.some((s) => s.sourceId === 'G04' && s.proposedText === 'Coffees with a sense of origin' && s.state === 'draft'));
  await page.context().close();
});

test('autosave: an edit survives an immediate reload (recovered draft)', async () => {
  const page = await open();
  await page.route('**/api/suggestions', (r) => r.abort()); // the request never reaches the server
  const f = field(page, 'English headline: Rare, bright coffees');
  await f.fill('Rare and bright coffees, in season');
  await page.waitForTimeout(150);
  await page.unroute('**/api/suggestions');
  await page.reload();
  await page.getByRole('heading', { name: 'Coffee', exact: true }).waitFor();
  await page.waitForFunction(() => document.body.innerText.includes('Draft saved locally'), null, { timeout: 15000 });
  const v = await api('/api/workspace');
  assert.ok(v.suggestions.some((s) => s.sourceId === 'G02' && s.proposedText === 'Rare and bright coffees, in season'));
  await page.context().close();
});

test('autosave: an older save never reports “saved” while newer wording is pending', async () => {
  const page = await open();
  const gates = []; const releases = [];
  for (let i = 0; i < 2; i++) gates.push(new Promise((r) => releases.push(r)));
  let n = 0;
  await page.route('**/api/suggestions', async (r) => { const i = n++; if (i < 2) await gates[i]; await r.continue(); });
  const f = field(page, 'English headline: Explore our');
  await f.fill('Explore our coffees now');
  await f.blur(); // first save is held
  await page.waitForTimeout(200);
  await f.fill('Explore our coffees today');
  await f.blur();
  releases[0](); // the OLDER save completes first…
  await page.waitForTimeout(400);
  const mid = await page.locator('.savestate').innerText();
  assert.notEqual(mid.trim(), 'Draft saved locally', 'must not claim saved while the newest wording is still pending');
  releases[1]();
  await page.getByText('Draft saved locally').waitFor();
  const v = await api('/api/workspace');
  assert.equal(v.suggestions.find((s) => s.sourceId === 'G03' && s.language === 'EN' && s.state === 'draft').proposedText, 'Explore our coffees today');
  await page.context().close();
});

test('a draft cannot be approved until it is marked Ready for review; Snapshot says “Approve locally”', async () => {
  const page = await open();
  await page.goto(B + '/changes');
  await page.getByRole('heading', { name: 'Changes', exact: true }).waitFor();
  const draft = page.locator('.change', { hasText: 'Seasonal Coffee from Mexico' }).first();
  assert.equal(await draft.getByRole('button', { name: /Approve/ }).count(), 0);
  await draft.getByRole('button', { name: 'Ready for review' }).click();
  const ready = page.locator('section', { hasText: 'Ready for review' }).locator('.change', { hasText: 'Seasonal Coffee from Mexico' }).first();
  await ready.getByRole('button', { name: 'Approve new copy locally' }).waitFor();
  const edit = page.locator('section', { hasText: 'Ready for review' }).locator('.change', { hasText: 'Explore our' });
  void edit;
  await page.context().close();
});

test('combination feedback: Works / Needs work switch and clear; “What needs work?” is scoped', async () => {
  const page = await open();
  const card = page.locator('.excard').first();
  const works = card.getByRole('button', { name: /^Works — example 1$/ });
  const needs = card.getByRole('button', { name: /^Needs work — example 1$/ });
  await works.click(); await page.waitForTimeout(500);
  assert.equal(await works.getAttribute('aria-pressed'), 'true');
  await needs.click();
  assert.equal(await needs.getAttribute('aria-expanded'), 'true');
  await card.getByText('What needs work?').waitFor();
  await card.getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(500);
  assert.equal(await needs.getAttribute('aria-pressed'), 'true');
  assert.equal(await works.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.qtag', { hasText: 'Needs work' }).count(), 0, 'whole-combination feedback does not flag lines');
  await needs.click(); await page.waitForTimeout(500); // clicking the selected verdict clears it
  assert.equal(await needs.getAttribute('aria-pressed'), 'false');
  const comment = card.getByRole('button', { name: /^Comment — example 1$/ });
  assert.equal(await comment.getAttribute('aria-expanded'), 'false');
  await page.context().close();
});

test('Live Sheet cannot be selected before it is connected', async () => {
  const page = await open();
  await page.goto(B + '/settings');
  const live = page.getByRole('button', { name: /Live Sheet/ });
  await page.getByText('Connect the live Sheet').waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes('Checking…'));
  assert.equal(await live.isDisabled(), true);
  await page.context().close();
});

test('phone: navigation reachable, one language at a time, unfinished new row stays in its collection', async () => {
  const page = await open({ width: 390, height: 844 });
  for (const n of ['Workspace', 'Changes', 'Settings']) {
    const box = await page.getByRole('link', { name: n, exact: true }).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `${n} is reachable`);
  }
  const first = page.locator('.copyrow').first();
  assert.equal(await first.locator('textarea').count(), 1, 'one language at a time');
  await page.getByRole('button', { name: 'Add headline' }).click();
  await page.locator('select[aria-label="Collection"]').selectOption({ label: 'Subscriptions' });
  await page.getByText('Unfinished new headline in Coffee').waitFor();
  await page.getByRole('button', { name: 'Keep it here for later' }).click();
  await page.getByRole('heading', { name: 'Subscriptions', exact: true }).waitFor();
  assert.equal(await page.locator('[data-row^="tmp-"]').count(), 0, 'not moved to Subscriptions');
  await page.locator('select[aria-label="Collection"]').selectOption({ label: 'Coffee' });
  await page.getByRole('heading', { name: 'Coffee', exact: true }).waitFor();
  assert.equal(await page.locator('[data-row^="tmp-"]').count(), 1, 'still in Coffee');
  await page.context().close();
});

test('keyboard focus is visible on text fields', async () => {
  const page = await open();
  await page.keyboard.press('Tab');
  const f = field(page, 'English headline: Coffees in season');
  await f.focus();
  await page.keyboard.press('ArrowRight');
  const outline = await f.evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).borderColor);
  assert.doesNotMatch(outline, /^none rgba\(0, 0, 0, 0\)/);
  await page.context().close();
});
