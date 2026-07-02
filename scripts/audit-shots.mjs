#!/usr/bin/env node
/* ============================================================
 * audit-shots.mjs — render every marketing page for the UI audit loop.
 * Full-page screenshots, desktop + mobile, scroll-reveals forced visible,
 * motion disabled. No deps beyond a playwright-core + chromium that already
 * exist on the box (installed by the Playwright MCP). Self-locating.
 *
 *   node scripts/audit-shots.mjs                # serves ./ on :8199, shoots all
 *   BASE=http://localhost:3000 node scripts/audit-shots.mjs   # use a running server
 *   OUT=/tmp/shots node scripts/audit-shots.mjs
 * ============================================================ */
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || join(ROOT, 'scratchpad', 'shots');
const PORT = 8199;
let BASE = process.env.BASE || `http://localhost:${PORT}`;

// The six public marketing pages. cleanUrls in prod → serve the /index.html here.
const PAGES = [
  ['home', '/index.html'],
  ['about', '/about/index.html'],
  ['how-it-works', '/how-it-works/index.html'],
  ['offer', '/offer/index.html'],
  ['overview', '/overview/index.html'],
  ['group', '/group/index.html'],
];
const VIEWPORTS = [['desktop', 1440, 900], ['mobile', 390, 844]];

// ---- locate playwright-core + a chromium binary (installed by the MCP) ----
async function findFirst(globRoots, matcher) {
  for (const base of globRoots) {
    if (!existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const d = stack.pop();
      let ents; try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const p = join(d, e.name);
        if (e.isDirectory()) { if (stack.length < 4000) stack.push(p); }
        else if (matcher(p)) return p;
      }
    }
  }
  return null;
}
async function loadPlaywright() {
  try { return require('playwright-core'); } catch {}
  try { return require('playwright'); } catch {}
  // Fall back to a copy installed anywhere on the box (e.g. by the Playwright MCP / an npx cache).
  const home = '/home/' + (process.env.USER || 'sam');
  const hit = await findFirst(
    [home + '/.npm/_npx', home + '/.cache', home + '/.npm', '/root/.npm/_npx', '/root/.cache'],
    p => p.endsWith('/playwright-core/index.js') || p.endsWith('/playwright/index.js'));
  if (hit) { try { return require(hit); } catch {} }
  return null;
}

// ---- minimal static file server (only if BASE points at our own PORT) ----
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp', '.woff2':'font/woff2' };
function startServer() {
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      let file = join(ROOT, p);
      if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
      if (!existsSync(file)) { res.writeHead(404); return res.end('nf'); }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(500); res.end('err'); }
  });
  return new Promise(r => srv.listen(PORT, () => r(srv)));
}

const pw = await loadPlaywright();
if (!pw) { console.error('FATAL: no playwright-core/playwright available'); process.exit(1); }
const exe = pw.chromium.executablePath?.() && existsSync(pw.chromium.executablePath())
  ? pw.chromium.executablePath()
  : await findFirst(['/home/'+ (process.env.USER||'sam') +'/.cache/ms-playwright', '/root/.cache/ms-playwright'],
      p => p.endsWith('/chrome-linux/chrome') || p.endsWith('/chrome') || p.endsWith('headless_shell'));
if (!exe) { console.error('FATAL: no chromium binary found'); process.exit(1); }

await mkdir(OUT, { recursive: true });
const srv = (BASE === `http://localhost:${PORT}`) ? await startServer() : null;
const browser = await pw.chromium.launch({ executablePath: exe, headless: true });

for (const [vp, w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const [name, path] of PAGES) {
    try {
      await page.goto(BASE + path, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForTimeout(1500);
      await page.evaluate(() => {  // force scroll-reveal + typewriter into final visible state
        document.querySelectorAll('.reveal-on-scroll').forEach(e => e.classList.add('revealed'));
        document.querySelectorAll('.tw-line').forEach(e => e.classList.add('tw-revealed'));
      });
      await page.waitForTimeout(400);
      const f = join(OUT, `${name}-${vp}.png`);
      await page.screenshot({ path: f, fullPage: true });
      console.log('OK', f);
    } catch (e) { console.log('FAIL', name, vp, e.message); }
  }
  await ctx.close();
}
await browser.close();
if (srv) srv.close();
console.log('DONE →', OUT);
