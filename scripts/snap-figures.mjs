// scripts/snap-figures.mjs - PNG snapshots of an essay's non-photo figures (SVG
// diagrams, HTML chart cards), for platforms that can't draw them: the full-text
// feed and the LinkedIn / Substack copies (see scripts/syndicate.mjs).
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core [CHROMIUM_PATH=/path/to/chrome] \
//     node scripts/snap-figures.mjs <slug> [<slug> ...] [--base https://crads-ai.com]
//
// Writes writing/<slug>/fig-<n>.png, n counting the figures without an <img> in page
// order from 1 (the same count syndicate.mjs uses). Shoots the page at --base (the live
// site by default, so the CSS is real) in the light theme, 2x, at desktop width.
// Re-run after changing a figure; tests/syndicate.test.js fails while a PNG is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const bi = argv.indexOf('--base');
const base = bi >= 0 ? argv.splice(bi, 2)[1] : 'https://crads-ai.com';
const slugs = argv;
if (!slugs.length) { console.error('usage: snap-figures.mjs <slug> [...]'); process.exit(2); }

const core = process.env.PLAYWRIGHT_CORE
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href)
  : await import('playwright-core');
// CHROMIUM_PATH: a Chromium binary when the playwright-core version and the installed browser differ.
const browser = await core.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });

for (const slug of slugs) {
  await page.goto(`${base}/writing/${slug}`, { waitUntil: 'networkidle' });
  const figs = page.locator('article.essay-body figure:not(:has(img))');
  const count = await figs.count();
  for (let i = 0; i < count; i += 1) {
    const out = path.join(ROOT, 'writing', slug, `fig-${i + 1}.png`);
    const fig = figs.nth(i);
    await fig.scrollIntoViewIfNeeded();
    // The caption stays text on the other platforms, so shoot the figure without it.
    await fig.evaluate((el) => el.querySelector('figcaption')?.style.setProperty('display', 'none'));
    await fig.screenshot({ path: out });
    await fig.evaluate((el) => el.querySelector('figcaption')?.style.removeProperty('display'));
    console.log(`${path.relative(ROOT, out)}  ${fs.statSync(out).size} bytes`);
  }
}
await browser.close();
