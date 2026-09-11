// tests/noRetiredCopy.test.js - the v3 coaching ladder is retired (2026-09-09),
// the v4 Working session too (2026-09-11), and their prices, product names
// and instalment plan may not appear anywhere
// the site serves, except inside the one marked "what is no longer offered"
// block on /offer. Docs pages are generated in the app repo and are gated
// there; they are skipped here.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, servedFiles } = require('../scripts/served.js');

const RETIRED = /A\$300\b|A\$1,000|A\$1,100|A\$650|\$300 AUD|\$1,000 AUD|\$650|pay[- ]in[- ]4|plan=pay4|Continuation Retainer|Coaching Block|Group Block|EA Basic Build|4 × 90|Working session|working-session|2 × 60|90 min/;
const ALLOW_BLOCK = /<!-- retired-offers -->[\s\S]*?<!-- \/retired-offers -->/g;

// Pages and the two JS files that render public copy. lib/*.js server modules
// (journeyTracker, skus) legitimately name the retired products for clients
// who bought them; they are not public copy.
function scanned() {
  const pages = servedFiles().filter((f) => /\.(html|xml)$/.test(f) && !f.startsWith('docs/') && !f.startsWith('account/') && !f.startsWith('lib/content/'));
  return [...pages, 'lib/site.js', 'lib/downloadPage.js'];
}

test('no retired price or product name is served outside the marked block on /offer', () => {
  const bad = [];
  for (const rel of scanned()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(ALLOW_BLOCK, '');
    const m = src.match(RETIRED);
    if (m) bad.push(`${rel}: "${m[0]}"`);
  }
  assert.deepStrictEqual(bad, [], `retired copy:\n${bad.join('\n')}`);
});

test('the marked retired-offers block exists exactly once, on /offer', () => {
  const offer = fs.readFileSync(path.join(ROOT, 'offer', 'index.html'), 'utf8');
  assert.strictEqual((offer.match(ALLOW_BLOCK) || []).length, 1);
  for (const rel of scanned()) {
    if (rel === 'offer/index.html') continue;
    assert.ok(!/<!-- retired-offers -->/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')), `${rel} carries a retired-offers block`);
  }
});

// v5 (2026-09-11): A$350 walkthrough, A$700 guided setup, A$233 an hour after
// the 30 days, and the "about A$10 a month" server line. Nothing else.
const V5_PRICES = new Set(['A$350', 'A$700', 'A$233', 'A$10']);
test('the v5 prices are the only prices on the offer and book pages', () => {
  for (const rel of ['offer/index.html', 'book/index.html', 'index.html']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(ALLOW_BLOCK, '');
    const prices = new Set([...src.matchAll(/A\$[\d,]+/g)].map((m) => m[0]));
    for (const p of prices) assert.ok(V5_PRICES.has(p), `${rel}: unexpected price ${p}`);
    assert.ok(prices.has('A$700') && prices.has('A$350') && prices.has('A$233'), `${rel}: the two v5 prices and the hourly rate expected`);
  }
});

// Em dashes: zero on every served site-owned page and in the shared JS
// (standing rule 2026-07-06; the last pages were swept 2026-09-09). Docs pages
// are gated in the app repo; lib/content/ is a client deliverable, not copy.
const NO_EM_DASH = () => [
  ...servedFiles().filter((f) => /\.html$/.test(f) && !f.startsWith('docs/') && !f.startsWith('account/') && !f.startsWith('lib/content/')),
  'lib/site.js', 'lib/downloadPage.js', 'README.md', 'archive/README.md',
];
test('served pages carry no em dashes', () => {
  for (const rel of NO_EM_DASH()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const i = src.indexOf('—');
    assert.strictEqual(i, -1, `${rel} has an em dash near: ${src.slice(Math.max(0, i - 40), i + 40)}`);
  }
});
