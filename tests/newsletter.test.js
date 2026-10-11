// tests/newsletter.test.js - the essay mailing list: double opt-in signup,
// throttles, honeypot, confirm link, and the box site.js injects on /writing.
'use strict';
process.env.BASE_URL = 'https://crads-ai.com';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeKv } = require('../lib/kv');
const { makeSubscribeHandler, makeConfirmHandler, cleanSource, EMAIL_LIMIT } = require('../lib/newsletter');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { const had = store.has(k); store.delete(k); return had ? 1 : 0; },
    incr: async (k) => { const n = parseInt(store.get(k) || '0') + 1; store.set(k, String(n)); return n; },
    expire: async () => 1,
    keys: async (pattern) => Array.from(store.keys()).filter(k => k.startsWith(pattern.replace('*', ''))),
    _store: store,
  };
}

function mockResend(error) {
  const sends = [];
  return { sends, resend: { emails: { send: async (a) => { sends.push(a); return error ? { error } : { id: 'em_1' }; } } } };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

const post = (body, ip = '1.2.3.4') => ({ method: 'POST', body, headers: { 'x-forwarded-for': ip } });

function setup(sendError) {
  const client = fakeKvClient();
  const kv = makeKv(client);
  const m = mockResend(sendError);
  return { client, kv, sends: m.sends, subscribe: makeSubscribeHandler({ kv, resend: m.resend }), confirm: makeConfirmHandler({ kv }) };
}

function tokenFrom(send) {
  const m = send.text.match(/confirm\?token=([a-f0-9]+)/);
  assert.ok(m, 'confirm email carries a token link');
  return m[1];
}

test('signup sends one confirm email from the crads-ai.com domain and stores no subscriber yet', async () => {
  const s = setup();
  const res = mockRes();
  await s.subscribe(post({ email: ' Reader@Example.com ', source: '/writing/which-love' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(s.sends.length, 1);
  assert.strictEqual(s.sends[0].to, 'reader@example.com');
  assert.match(s.sends[0].from, /@crads-ai\.com>$/);
  assert.match(s.sends[0].text, /^https:\/\/crads-ai\.com\/api\/newsletter\/confirm\?token=/m);
  assert.ok(!/—/.test(s.sends[0].text + s.sends[0].subject), 'no em dashes in the email');
  assert.strictEqual(await s.kv.getSubscriber('reader@example.com'), null);
});

test('confirm link turns the pending signup into a subscriber, once', async () => {
  const s = setup();
  await s.subscribe(post({ email: 'reader@example.com', source: '/writing/which-love' }), mockRes());
  const token = tokenFrom(s.sends[0]);

  const res = mockRes();
  await s.confirm({ method: 'GET', query: { token } }, res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.headers.location, '/writing?subscribed=1#subscribe');
  const sub = await s.kv.getSubscriber('reader@example.com');
  assert.strictEqual(sub.status, 'subscribed');
  assert.strictEqual(sub.source, '/writing/which-love');
  assert.deepStrictEqual((await s.kv.listSubscribers()).map(r => r.email), ['reader@example.com']);

  const again = mockRes();
  await s.confirm({ method: 'GET', query: { token } }, again);
  assert.strictEqual(again.headers.location, '/writing?subscribed=expired#subscribe');
});

test('bad or missing tokens redirect to the expired message', async () => {
  const s = setup();
  for (const query of [{}, { token: 'x' }, { token: 'a'.repeat(64) }]) {
    const res = mockRes();
    await s.confirm({ method: 'GET', query }, res);
    assert.strictEqual(res.headers.location, '/writing?subscribed=expired#subscribe');
  }
});

test('already subscribed: same 200, no second email', async () => {
  const s = setup();
  await s.kv.setSubscriber('reader@example.com', { email: 'reader@example.com', status: 'subscribed' });
  const res = mockRes();
  await s.subscribe(post({ email: 'reader@example.com' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(s.sends.length, 0);
});

test('honeypot filled: quiet 200, no email', async () => {
  const s = setup();
  const res = mockRes();
  await s.subscribe(post({ email: 'bot@example.com', website: 'http://spam' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(s.sends.length, 0);
});

test('invalid email is a 400', async () => {
  const s = setup();
  const res = mockRes();
  await s.subscribe(post({ email: 'not-an-email' }), res);
  assert.strictEqual(res.statusCode, 400);
});

test('per-address throttle stops confirm-email floods', async () => {
  const s = setup();
  for (let i = 0; i < EMAIL_LIMIT; i++) await s.subscribe(post({ email: 'x@example.com' }, '9.9.9.' + i), mockRes());
  const res = mockRes();
  await s.subscribe(post({ email: 'x@example.com' }, '9.9.9.99'), res);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(s.sends.length, EMAIL_LIMIT);
});

test('a Resend failure is reported, not swallowed', async () => {
  const s = setup({ message: 'boom' });
  const res = mockRes();
  await s.subscribe(post({ email: 'reader@example.com' }), res);
  assert.strictEqual(res.statusCode, 502);
});

test('GET subscribe is a 405; OPTIONS is a 204', async () => {
  const s = setup();
  const g = mockRes(); await s.subscribe({ method: 'GET', headers: {} }, g);
  assert.strictEqual(g.statusCode, 405);
  const o = mockRes(); await s.subscribe({ method: 'OPTIONS', headers: {} }, o);
  assert.strictEqual(o.statusCode, 204);
});

test('source is kept only when it is a plain site path', () => {
  assert.strictEqual(cleanSource('/writing/nice-or-kind'), '/writing/nice-or-kind');
  assert.strictEqual(cleanSource('https://evil.example'), '/writing');
  assert.strictEqual(cleanSource('/<script>'), '/writing');
});

test('site.js injects the box on /writing pages and posts to the API', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'site.js'), 'utf8');
  assert.match(src, /safe\(initSubscribe\)/);
  assert.match(src, /\/api\/newsletter\/subscribe/);
  assert.ok(!/—/.test(src.slice(src.indexOf('SUBSCRIBE_MSG'), src.indexOf('function initAboutAccordion'))), 'no em dashes in box copy');
  const css = fs.readFileSync(path.join(__dirname, '..', 'writing', 'essay.css'), 'utf8');
  assert.match(css, /\.subscribe-hp/, 'honeypot is hidden by CSS');
});

// ---- unsubscribe + direct adds (2026-10-11) ---------------------------------
const { makeUnsubscribeHandler, addSubscriber, unsubscribeUrl } = require('../lib/newsletter');

function unsubReq(url, method = 'GET') {
  const u = new URL(url);
  return { method, query: Object.fromEntries(u.searchParams), headers: {} };
}

test('unsubscribe link marks the row unsubscribed and keeps the record', async () => {
  const s = setup();
  await addSubscriber(s.kv, 'reader@example.com', { source: '/writing', consent: 'inferred-customer' });
  const res = mockRes();
  await makeUnsubscribeHandler({ kv: s.kv })(unsubReq(unsubscribeUrl(await s.kv.getSubscriber('reader@example.com'))), res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.headers.location, '/writing?subscribed=unsubscribed#subscribe');
  const row = await s.kv.getSubscriber('reader@example.com');
  assert.strictEqual(row.status, 'unsubscribed');
  assert.ok(row.unsubscribed_at);
  assert.strictEqual(row.consent, 'inferred-customer');
});

test('one-click POST unsubscribe (RFC 8058) answers 200', async () => {
  const s = setup();
  await addSubscriber(s.kv, 'reader@example.com', { source: '/writing', consent: 'double-opt-in' });
  const res = mockRes();
  await makeUnsubscribeHandler({ kv: s.kv })(unsubReq(unsubscribeUrl(await s.kv.getSubscriber('reader@example.com')), 'POST'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual((await s.kv.getSubscriber('reader@example.com')).status, 'unsubscribed');
});

test('a forged or swapped signature unsubscribes nobody', async () => {
  const s = setup();
  await addSubscriber(s.kv, 'a@example.com', { source: '/writing', consent: 'double-opt-in' });
  await addSubscriber(s.kv, 'b@example.com', { source: '/writing', consent: 'double-opt-in' });
  const good = new URL(unsubscribeUrl(await s.kv.getSubscriber('b@example.com')));
  const forged = `https://crads-ai.com/api/newsletter/unsubscribe?e=a%40example.com&t=${good.searchParams.get('t')}`;
  for (const url of [forged, 'https://crads-ai.com/api/newsletter/unsubscribe?e=a%40example.com&t=zz']) {
    const res = mockRes();
    await makeUnsubscribeHandler({ kv: s.kv })(unsubReq(url), res);
    assert.strictEqual(res.headers.location, '/writing?subscribed=badlink#subscribe');
  }
  assert.strictEqual((await s.kv.getSubscriber('a@example.com')).status, 'subscribed');
});

test('an inferred-consent import never re-adds someone who unsubscribed', async () => {
  const s = setup();
  await s.kv.setSubscriber('gone@example.com', { email: 'gone@example.com', status: 'unsubscribed' });
  const r = await addSubscriber(s.kv, 'gone@example.com', { source: 'import', consent: 'inferred-customer' });
  assert.strictEqual(r.added, false);
  assert.strictEqual((await s.kv.getSubscriber('gone@example.com')).status, 'unsubscribed');
  // ...but ticking the box again is fresh, express consent.
  const again = await addSubscriber(s.kv, 'gone@example.com', { source: '/book/discovery', consent: 'express-booking' });
  assert.strictEqual(again.added, true);
});

test('confirmed signups record double-opt-in consent', async () => {
  const s = setup();
  await s.subscribe(post({ email: 'dbl@example.com' }), mockRes());
  const token = tokenFrom(s.sends[0]);
  await s.confirm({ method: 'GET', query: { token } }, mockRes());
  assert.strictEqual((await s.kv.getSubscriber('dbl@example.com')).consent, 'double-opt-in');
});

test('every way onto the list leaves a 32-hex unsub_token, kept across re-adds', async () => {
  const s = setup();
  await s.subscribe(post({ email: 'tok@example.com' }), mockRes());
  await s.confirm({ method: 'GET', query: { token: tokenFrom(s.sends[0]) } }, mockRes());
  const t1 = (await s.kv.getSubscriber('tok@example.com')).unsub_token;
  assert.match(t1, /^[a-f0-9]{32}$/);
  await addSubscriber(s.kv, 'box@example.com', { source: '/book/discovery', consent: 'express-booking' });
  assert.match((await s.kv.getSubscriber('box@example.com')).unsub_token, /^[a-f0-9]{32}$/);
  await s.kv.setSubscriber('tok@example.com', { ...(await s.kv.getSubscriber('tok@example.com')), status: 'unsubscribed' });
  await addSubscriber(s.kv, 'tok@example.com', { source: '/book/discovery', consent: 'express-booking' });
  assert.strictEqual((await s.kv.getSubscriber('tok@example.com')).unsub_token, t1);
});

test('unsubscribeUrl refuses a row without a token', () => {
  assert.throws(() => unsubscribeUrl({ email: 'x@example.com' }), /unsub_token/);
});
