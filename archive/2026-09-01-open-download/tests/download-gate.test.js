// tests/download-gate.test.js - the beta password gate on /download.
'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const PW = 'test-gate-password';
let saved;

beforeEach(() => { saved = process.env.DOWNLOAD_PASSWORD; process.env.DOWNLOAD_PASSWORD = PW; });
afterEach(() => {
  if (saved === undefined) delete process.env.DOWNLOAD_PASSWORD;
  else process.env.DOWNLOAD_PASSWORD = saved;
});

function load() {
  // the handler reads the env var at call time, but clear the cache anyway so a
  // future top-level read cannot make these tests order-dependent
  for (const k of Object.keys(require.cache)) {
    if (/lib[\\/]downloadGate|lib[\\/]downloadPage|api[\\/]download/.test(k)) delete require.cache[k];
  }
  return require('../api/download.js');
}

// Models Vercel's res, NOT bare node's. The difference is load-bearing: an
// earlier draft of the handler used res.status(n).setHeader(...), which this
// mock happily accepted and which threw "res.status is not a function" the
// moment it met a real server. So mock only what Vercel actually provides
// (status/send/json/redirect on top of node's setHeader/end) and nothing more.
function mockRes() {
  const r = { statusCode: 200, headers: {}, body: '', ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  r.getHeader = (k) => r.headers[k.toLowerCase()];
  r.status = (c) => { r.statusCode = c; return r; };
  r.send = (b) => { r.body = b; r.ended = true; return r; };
  r.json = (o) => { r.body = JSON.stringify(o); r.ended = true; return r; };
  r.redirect = (c, loc) => {
    if (typeof c === 'string') { loc = c; c = 302; }
    r.statusCode = c; r.headers.location = loc; r.ended = true; return r;
  };
  r.end = () => { r.ended = true; return r; };
  return r;
}

const call = async (req) => {
  const res = mockRes();
  await load()(Object.assign({ method: 'GET', headers: {}, query: {} }, req), res);
  return res;
};

const cookieFor = (pw) => {
  process.env.DOWNLOAD_PASSWORD = pw;
  const { tokenFor, normalise } = require('../lib/downloadGate');
  return `crads_beta=${tokenFor(normalise(pw))}`;
};

test('a stranger gets the form, not the page, and not a 200', async () => {
  const res = await call({});
  assert.equal(res.statusCode, 401);
  assert.match(res.body, /private beta/i);
  assert.doesNotMatch(res.body, /Download for Windows/, 'the page body must not leak to a locked visitor');
});

test('the locked form never carries the asset urls', async () => {
  const res = await call({});
  assert.doesNotMatch(res.body, /crads-ai\.exe/);
  assert.doesNotMatch(res.body, /crads-ai-mac\.zip/);
  assert.doesNotMatch(res.body, /github\.com/);
});

test('the right password sets a cookie and redirects to the page', async () => {
  const res = await call({ method: 'POST', body: { password: PW } });
  assert.equal(res.statusCode, 303);
  assert.equal(res.getHeader('location'), '/download');
  const c = res.getHeader('set-cookie');
  assert.match(c, /^crads_beta=/);
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Lax/);
  assert.doesNotMatch(c, new RegExp(PW), 'the cookie must never carry the password itself');
});

test('the password survives the trip off an email: spaces and capitals', async () => {
  for (const variant of [`  ${PW}  `, PW.toUpperCase(), ` ${PW.toUpperCase()}`]) {
    const res = await call({ method: 'POST', body: { password: variant } });
    assert.equal(res.statusCode, 303, `should accept ${JSON.stringify(variant)}`);
  }
});

test('a urlencoded string body works too, not just a parsed object', async () => {
  const res = await call({ method: 'POST', body: `password=${encodeURIComponent(PW)}` });
  assert.equal(res.statusCode, 303);
});

test('a wrong password is refused and says so without hinting', async () => {
  const res = await call({ method: 'POST', body: { password: 'nope' } });
  assert.equal(res.statusCode, 401);
  assert.match(res.body, /didn't work/i);
  assert.doesNotMatch(res.body, new RegExp(PW), 'the error must not disclose the password');
});

test('a valid cookie opens the page', async () => {
  const res = await call({ headers: { cookie: cookieFor(PW) } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Download for Windows/);
  assert.match(res.body, /Download for Mac/);
});

test('a cookie minted under a DIFFERENT password does not open the page', async () => {
  const stale = cookieFor('the-old-password');
  process.env.DOWNLOAD_PASSWORD = PW;              // password rotated since
  const res = await call({ headers: { cookie: stale } });
  assert.equal(res.statusCode, 401, 'rotating the password must evict old cookies');
});

test('a forged cookie value does not open the page', async () => {
  for (const v of ['1', 'true', 'crads_beta', 'a'.repeat(64)]) {
    const res = await call({ headers: { cookie: `crads_beta=${v}` } });
    assert.equal(res.statusCode, 401, `forged ${v} must not pass`);
  }
});

test('asset routes redirect to the real file only when unlocked', async () => {
  const win = await call({ query: { asset: 'windows' }, headers: { cookie: cookieFor(PW) } });
  assert.equal(win.statusCode, 302);
  assert.match(win.getHeader('location'), /crads-ai\.exe$/);
  const mac = await call({ query: { asset: 'mac' }, headers: { cookie: cookieFor(PW) } });
  assert.match(mac.getHeader('location'), /crads-ai-mac\.zip$/);
});

test('asset routes send a locked visitor to the form, never to the file', async () => {
  for (const asset of ['windows', 'mac']) {
    const res = await call({ query: { asset } });
    assert.equal(res.statusCode, 302);
    assert.equal(res.getHeader('location'), '/download', 'a locked deep link must not reach the binary');
  }
});

test('an unknown asset is a 404, not a redirect', async () => {
  const res = await call({ query: { asset: 'linux' }, headers: { cookie: cookieFor(PW) } });
  assert.equal(res.statusCode, 404);
});

test('no DOWNLOAD_PASSWORD fails CLOSED, so a misconfig cannot publish the page', async () => {
  delete process.env.DOWNLOAD_PASSWORD;
  const res = await call({});
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(res.body, /Download for Windows/);
  const asset = await call({ query: { asset: 'windows' } });
  assert.equal(asset.statusCode, 503, 'assets are shut too, not just the page');
});

test('an empty or whitespace password env var counts as unset', async () => {
  for (const v of ['', '   ']) {
    process.env.DOWNLOAD_PASSWORD = v;
    const res = await call({ method: 'POST', body: { password: v } });
    assert.equal(res.statusCode, 503, 'a blank env var must not become a blank password');
  }
});

test('the page is never cached by a shared cache', async () => {
  const res = await call({ headers: { cookie: cookieFor(PW) } });
  assert.match(res.getHeader('cache-control'), /no-store/);
});

test('the served page routes its buttons through the gate, not straight to github', async () => {
  const res = await call({ headers: { cookie: cookieFor(PW) } });
  assert.match(res.body, /href="\/download\/windows"/);
  assert.match(res.body, /href="\/download\/mac"/);
  assert.doesNotMatch(res.body, /github\.com/, 'a raw asset link on the page would bypass the gate');
});
