// scripts/audit-app-billing.mjs — render /app/billing through the REAL handler
// against fixture data (Sam's live shape: two rocks, one direct pebble, billing
// on) and screenshot it desktop + mobile, so the page can be scored against
// docs/audit/RUBRIC.md without a signed-in browser. Same playwright locator as
// audit-shots.mjs. Mocks only the three edges the handler touches: requireAuth,
// the KV, the directory client. Nothing here runs in production.
//
//   node scripts/audit-app-billing.mjs [--state=off|on|empty|unreadable]
//   -> scratchpad/shots/app-billing-<state>-{desktop,mobile}.png + .html
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scratchpad', 'shots');
const state = (process.argv.find((a) => a.startsWith('--state=')) || '--state=on').split('=')[1];

// ---- fixtures: Sam's real shape on 2026-08-23 ----
const USER = { email: 'cradsdavis@gmail.com', id: 'acc_c930c1b079049b6e47535258', state_version: 1, billing_enabled: state !== 'off' };
const MINERALS = state === 'empty' ? [] : [
  { mineral_id: 'm1', label: 'Flat Earth Society of America', host: 'flat-earth-society-of-am.crads-ai.com', tier: 'rock', org: 'flat-earth-society-of-america', anchor: '', held_by: 'you' },
  { mineral_id: 'm2', label: 'QA R2', host: 'qa-r2-gmail.crads-ai.com', tier: 'rock', org: 'qa-r2-gmail', anchor: '', held_by: 'you' },
  { mineral_id: 'm3', label: 'The Oracle', host: 'the-oracle.crads-ai.com', tier: 'pebble', anchor: 'flat-earth-society-of-america', held_by: 'you' },
  { mineral_id: 'm4', label: 'John Jones', host: 'john-jones.crads-ai.com', tier: 'pebble', anchor: 'flat-earth-society-of-america', held_by: 'someone else' },
];
const D = (y, m, d) => Date.UTC(y, m - 1, d);
const EVENTS = [
  { type: 'box-built', at: D(2026, 8, 18), slug: 'flat-earth-society-of-am' },
  { type: 'box-built', at: D(2026, 8, 13), slug: 'qa-r2-gmail' },
  { type: 'member-join', at: D(2026, 8, 18), org: 'flat-earth-society-of-america', e: 'h1', role: 'member', slug: 'the-oracle', rel: 'anchored', status: 'active' },
  { type: 'member-join', at: D(2026, 8, 18), org: 'flat-earth-society-of-america', e: 'h2', role: 'member', slug: 'john-jones', rel: 'anchored', status: 'active' },
  { type: 'member-join', at: D(2026, 8, 18), org: 'qa-r2-gmail', e: 'h3', role: 'member', slug: 'flat-earth-society-of-am', rel: 'joined', status: 'active' },
];

// ---- mocks via the require cache ----
const mock = (rel, exports) => { const p = require.resolve(join(ROOT, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
mock('lib/account.js', { requireAuth: async () => USER });
mock('lib/auth.js', { isAdmin: () => true });
mock('lib/kv.js', { defaultKv: () => ({ getUser: async () => USER, setUser: async () => {} }) });
mock('lib/directory.js', { directoryFor: () => ({
  minerals: async () => (state === 'unreadable' ? { ok: false, reason: 'the directory answered 503' } : { ok: true, minerals: MINERALS }),
  events: async () => ({ ok: true, events: EVENTS }),
  setLicence: async () => ({ ok: true }),
}) });

const handler = require(join(ROOT, 'api', 'app', 'billing.js'));
let html = '', status = 0;
const res = {
  setHeader() {}, status(s) { status = s; return res; }, send(b) { html = String(b); return res; }, end() { return res; },
};
await handler({ method: 'GET', headers: {}, url: '/app/billing' }, res);
if (status !== 200) { console.error('handler answered', status); process.exit(1); }
await mkdir(OUT, { recursive: true });
const base = join(OUT, `app-billing-${state}`);
await writeFile(base + '.html', html);

// ---- screenshots ----
async function findFirst(roots, matcher) {
  for (const b of roots) {
    if (!existsSync(b)) continue;
    const stack = [b];
    while (stack.length) {
      const d = stack.pop(); let ents;
      try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) { const p = join(d, e.name); if (e.isDirectory()) { if (stack.length < 4000) stack.push(p); } else if (matcher(p)) return p; }
    }
  }
  return null;
}
let pw = null;
try { pw = require('playwright-core'); } catch {}
if (!pw) { try { pw = require('playwright'); } catch {} }
if (!pw) {
  const hit = await findFirst(['/home/sam/.npm/_npx', '/home/sam/.cache', '/home/sam/.npm'], (p) => p.endsWith('/playwright-core/index.js') || p.endsWith('/playwright/index.js'));
  if (hit) pw = require(hit);
}
if (!pw) { console.log('no playwright found; HTML written to', base + '.html'); process.exit(0); }
const exe = pw.chromium.executablePath?.() && existsSync(pw.chromium.executablePath())
  ? pw.chromium.executablePath()
  : await findFirst(['/home/sam/.cache/ms-playwright'], (p) => p.endsWith('/chrome-linux/chrome') || p.endsWith('headless_shell'));
const browser = await pw.chromium.launch({ executablePath: exe, headless: true });
for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, reducedMotion: 'reduce' });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: `${base}-${name}.png`, fullPage: true });
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`${name}: ${base}-${name}.png  scrollWidth=${w}${w > vp.width ? '  <-- HORIZONTAL OVERFLOW' : ''}`);
  await page.close();
}
await browser.close();
