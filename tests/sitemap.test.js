// tests/sitemap.test.js - sitemap.xml must equal what scripts/build-sitemap.mjs
// would write. A page added or retired without `npm run sitemap` fails here.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');

async function gen() {
  return import(pathToFileURL(path.join(ROOT, 'scripts', 'build-sitemap.mjs')).href);
}

function locs() {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

test('sitemap.xml lists exactly the generated URL set', async () => {
  const { expectedUrls } = await gen();
  const want = expectedUrls().map((u) => `https://crads-ai.com${u}`).sort();
  const have = locs().sort();
  assert.deepStrictEqual(have, want, 'run `npm run sitemap`');
});

test('every sitemap URL is absolute, indexable, and not a redirect source or the account portal', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const gone = new Set((cfg.redirects || []).map((r) => r.source));
  for (const loc of locs()) {
    assert.ok(loc.startsWith('https://crads-ai.com/'), `absolute: ${loc}`);
    const u = loc.slice('https://crads-ai.com'.length);
    assert.ok(!gone.has(u), `redirect source in sitemap: ${u}`);
    assert.ok(!u.startsWith('/account'), `account portal in sitemap: ${u}`);
  }
});

test('the product pages are in the sitemap', () => {
  const have = new Set(locs());
  for (const u of ['/', '/download', '/docs', '/docs/first-hour', '/offer']) {
    assert.ok(have.has(`https://crads-ai.com${u}`), `expected ${u} in sitemap`);
  }
});
