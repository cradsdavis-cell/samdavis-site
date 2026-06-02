'use strict';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { makeKv } = require('../lib/kv');
const { makeHandler } = require('../lib/authVerifyToken');
const { verifySession } = require('../lib/auth');

// --- Mocks -------------------------------------------------------------------

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { const had = store.has(k); store.delete(k); return had ? 1 : 0; },
    incr: async (k) => {
      const cur = parseInt(store.get(k) || '0');
      const next = cur + 1;
      store.set(k, next.toString());
      return next;
    },
    expire: async () => 1,
    keys: async (pattern) => Array.from(store.keys()).filter(k => k.startsWith(pattern.replace('*', ''))),
    _store: store,
  };
}

function mockReq({ query = {}, method = 'GET' } = {}) {
  return { method, query };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {}, redirectLocation: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.redirect = (code, location) => {
    res.statusCode = code;
    res.redirectLocation = location;
    return res;
  };
  res.end = () => res;
  return res;
}

// --- Tests -------------------------------------------------------------------

test('Missing token redirects to /account/verify?error=missing', async () => {
  const kvClient = fakeKvClient();
  const handler = makeHandler({ kv: makeKv(kvClient) });
  const res = mockRes();
  await handler(mockReq({ query: {} }), res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.redirectLocation, '/account/verify?error=missing');
});

test('Unknown token redirects to /account/verify?error=invalid', async () => {
  const kvClient = fakeKvClient();
  const handler = makeHandler({ kv: makeKv(kvClient) });
  const res = mockRes();
  await handler(mockReq({ query: { token: 'nonexistent' } }), res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.redirectLocation, '/account/verify?error=invalid');
});

test('Expired token redirects to /account/verify?error=expired', async () => {
  const kvClient = fakeKvClient();
  const kv = makeKv(kvClient);
  await kv.setUser('alex@example.com', { email: 'alex@example.com', state_version: 1 });
  const pastDate = new Date(Date.now() - 60_000).toISOString();
  await kv.setAuthToken('expired-tok', {
    email: 'alex@example.com',
    expires_at: pastDate,
    created_at: pastDate,
  }, 900);
  const handler = makeHandler({ kv });
  const res = mockRes();
  await handler(mockReq({ query: { token: 'expired-tok' } }), res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.redirectLocation, '/account/verify?error=expired');
});

test('Valid token redirects to /account/ + sets session cookie', async () => {
  const kvClient = fakeKvClient();
  const kv = makeKv(kvClient);
  await kv.setUser('alex@example.com', { email: 'alex@example.com', state_version: 3 });
  const futureDate = new Date(Date.now() + 60_000).toISOString();
  await kv.setAuthToken('good-tok', {
    email: 'alex@example.com',
    expires_at: futureDate,
    created_at: new Date().toISOString(),
  }, 900);
  const handler = makeHandler({ kv });
  const res = mockRes();
  await handler(mockReq({ query: { token: 'good-tok' } }), res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.redirectLocation, '/account/');
  const cookie = res.headers['set-cookie'];
  assert.ok(cookie, 'Set-Cookie header should be present');
  assert.ok(cookie.startsWith('session_jwt='), 'cookie should be session_jwt');
  // Extract JWT and verify it
  const jwtMatch = cookie.match(/session_jwt=([^;]+)/);
  assert.ok(jwtMatch);
  const payload = verifySession(jwtMatch[1]);
  assert.strictEqual(payload.email, 'alex@example.com');
  assert.strictEqual(payload.state_version, 3);
});

test('Valid token is single-use (deleted after use)', async () => {
  const kvClient = fakeKvClient();
  const kv = makeKv(kvClient);
  await kv.setUser('alex@example.com', { email: 'alex@example.com', state_version: 1 });
  const futureDate = new Date(Date.now() + 60_000).toISOString();
  await kv.setAuthToken('one-shot-tok', {
    email: 'alex@example.com',
    expires_at: futureDate,
    created_at: new Date().toISOString(),
  }, 900);
  const handler = makeHandler({ kv });
  const res1 = mockRes();
  await handler(mockReq({ query: { token: 'one-shot-tok' } }), res1);
  assert.strictEqual(res1.statusCode, 302);
  assert.strictEqual(res1.redirectLocation, '/account/');
  // Token should be gone
  const after = await kv.getAuthToken('one-shot-tok');
  assert.strictEqual(after, null);
  // Second use → invalid
  const res2 = mockRes();
  await handler(mockReq({ query: { token: 'one-shot-tok' } }), res2);
  assert.strictEqual(res2.statusCode, 302);
  assert.strictEqual(res2.redirectLocation, '/account/verify?error=invalid');
});
