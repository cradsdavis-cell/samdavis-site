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

// ---- the download tally (2026-10-14) --------------------------------------
const { makeHandler } = require('../api/download');
const { makeKv } = require('../lib/kv');

function fakeRes() {
  const res = { headers: {}, statusCode: 200, location: null, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.redirect = (code, url) => { res.statusCode = code; res.location = url; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.end = () => { res.ended = true; };
  res.send = () => {};
  return res;
}
function memoryKv() {
  const store = {};
  const kv = makeKv({ incr: async (k) => { store[k] = (store[k] || 0) + 1; return store[k]; } });
  return { kv, store };
}
const req = (method, asset, ua = 'Mozilla/5.0 (Windows NT 10.0)') =>
  ({ method, query: { asset }, headers: { 'user-agent': ua } });

test('a GET of each binary is counted and still redirects', async () => {
  const { kv, store } = memoryKv();
  const handler = makeHandler({ getKv: () => kv });
  const res = fakeRes();
  await handler(req('GET', 'windows'), res);
  await handler(req('GET', 'windows'), fakeRes());
  await handler(req('GET', 'mac'), fakeRes());
  assert.strictEqual(res.statusCode, 302);
  assert.match(res.location, /crads-ai\.exe$/);
  assert.strictEqual(store['dl:total:windows'], 2);
  assert.strictEqual(store['dl:total:mac'], 1);
  const dayKeys = Object.keys(store).filter(k => k.startsWith('dl:day:'));
  assert.ok(dayKeys.every(k => /^dl:day:\d{4}-\d{2}-\d{2}:(windows|mac)$/.test(k)), dayKeys.join());
});

test('HEAD requests, bots and unknown assets are not counted', async () => {
  const { kv, store } = memoryKv();
  const handler = makeHandler({ getKv: () => kv });
  await handler(req('HEAD', 'windows'), fakeRes());
  await handler(req('GET', 'mac', 'Slackbot-LinkExpanding 1.0'), fakeRes());
  await handler(req('GET', 'mac', 'Mozilla/5.0 (compatible; bingbot/2.0)'), fakeRes());
  const res = fakeRes();
  await handler(req('GET', 'linux'), res);
  assert.strictEqual(res.statusCode, 404);
  assert.deepStrictEqual(store, {});
});

test('a broken or hung KV never costs the visitor the download', async () => {
  const broken = makeHandler({ getKv: () => { throw new Error('no redis'); } });
  const r1 = fakeRes();
  await broken(req('GET', 'windows'), r1);
  assert.strictEqual(r1.statusCode, 302);

  const failing = makeHandler({ getKv: () => ({ countDownload: async () => { throw new Error('down'); } }) });
  const r2 = fakeRes();
  await failing(req('GET', 'mac'), r2);
  assert.strictEqual(r2.statusCode, 302);

  const hung = makeHandler({ getKv: () => ({ countDownload: () => new Promise(() => {}) }), timeoutMs: 20 });
  const r3 = fakeRes();
  const t0 = Date.now();
  await hung(req('GET', 'windows'), r3);
  assert.strictEqual(r3.statusCode, 302);
  assert.ok(Date.now() - t0 < 500, 'redirect waited on a hung KV');
});

test('days are Sydney dates', () => {
  const { sydneyDay } = require('../lib/downloadCount');
  // 14:30 UTC on 13 Oct is 01:30 on 14 Oct in Sydney (AEDT, UTC+11)
  assert.strictEqual(sydneyDay(new Date('2026-10-13T14:30:00Z')), '2026-10-14');
});
