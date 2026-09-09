// tests/download.test.js - the /download page is indexable, offers both
// binaries, renders sizes when the release answers and stays whole when it
// does not, and links back into the site.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderDownloadPage } = require('../lib/downloadPage');
const { releaseAssets, _resetCache, NAMES } = require('../lib/releaseAssets');

test('download page is indexable and canonical', () => {
  const html = renderDownloadPage({ assets: null });
  assert.doesNotMatch(html, /noindex/, 'noindex must be gone');
  assert.match(html, /<link rel="canonical" href="https:\/\/crads-ai\.com\/download">/);
  assert.match(html, /<meta property="og:site_name" content="Crads-AI">/);
});

test('download page offers both binaries and a way back into the site', () => {
  const html = renderDownloadPage({ assets: null });
  assert.match(html, /href="\/download\/windows"/);
  assert.match(html, /href="\/download\/mac"/);
  assert.match(html, /href="\/docs\/first-hour"/);
  assert.match(html, /href="\/docs"/);
  assert.ok(!html.includes('{{'), 'no unfilled placeholders');
});

test('sizes render from the release and vanish cleanly when unknown', () => {
  const withSizes = renderDownloadPage({ assets: { windows: { size: '86 MB' }, mac: { size: '36 MB' } } });
  assert.ok(withSizes.includes('crads-ai.exe &middot; 86 MB'));
  assert.ok(withSizes.includes('crads-ai-mac.zip &middot; 36 MB'));
  const without = renderDownloadPage({ assets: { windows: { size: null }, mac: { size: null } } });
  assert.ok(without.includes('crads-ai.exe</span>'));
  assert.ok(without.includes('crads-ai-mac.zip</span>'));
  assert.ok(!/\d+ MB/.test(without), 'no hard-coded size survives');
});

test('releaseAssets maps the GitHub release and never throws', async () => {
  _resetCache();
  const ok = async () => ({
    ok: true,
    json: async () => ({ assets: [
      { name: NAMES.windows, size: 86_400_000, browser_download_url: 'https://x/exe' },
      { name: NAMES.mac, size: 35_900_000, browser_download_url: 'https://x/zip' },
    ] }),
  });
  const a = await releaseAssets({ fetchImpl: ok, now: 1000 });
  assert.strictEqual(a.windows.size, '86 MB');
  assert.strictEqual(a.mac.size, '36 MB');

  // cached: a failing fetch inside the TTL still answers the cached value
  const boom = async () => { throw new Error('offline'); };
  const b = await releaseAssets({ fetchImpl: boom, now: 2000 });
  assert.strictEqual(b.windows.size, '86 MB');

  // cold + failing: nulls, no throw
  _resetCache();
  const c = await releaseAssets({ fetchImpl: boom, now: 3000 });
  assert.deepStrictEqual(c, { windows: { size: null, url: null }, mac: { size: null, url: null } });

  // non-2xx: nulls
  const nope = async () => ({ ok: false, json: async () => ({}) });
  _resetCache();
  const d = await releaseAssets({ fetchImpl: nope, now: 4000 });
  assert.strictEqual(d.windows.size, null);
});
