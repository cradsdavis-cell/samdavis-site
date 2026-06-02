'use strict';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
process.env.RESEND_FROM_EMAIL = 'Sam <hello@crads-ai.com>';
process.env.BASE_URL = 'https://crads-ai.com';

const test = require('node:test');
const assert = require('node:assert');
const { makeKv } = require('../lib/kv');
const { makeHandler } = require('../lib/authRequestLink');

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

function makeMockResend() {
  const sends = [];
  return {
    sends,
    resend: {
      emails: {
        send: async (args) => {
          sends.push(args);
          return { id: 'em_test_123' };
        },
      },
    },
  };
}

function mockReq(body, method = 'POST') {
  return { method, body };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

// --- Tests -------------------------------------------------------------------

test('OPTIONS returns 204', async () => {
  const kvClient = fakeKvClient();
  const { resend } = makeMockResend();
  const handler = makeHandler({ kv: makeKv(kvClient), resend });
  const req = mockReq(null, 'OPTIONS');
  const res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 204);
});

test('GET returns 405', async () => {
  const kvClient = fakeKvClient();
  const { resend } = makeMockResend();
  const handler = makeHandler({ kv: makeKv(kvClient), resend });
  const req = mockReq(null, 'GET');
  const res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 405);
});

test('POST missing email returns 400', async () => {
  const kvClient = fakeKvClient();
  const { resend } = makeMockResend();
  const handler = makeHandler({ kv: makeKv(kvClient), resend });
  const res = mockRes();
  await handler(mockReq({}), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_email');
});

test('POST invalid email returns 400', async () => {
  const kvClient = fakeKvClient();
  const { resend } = makeMockResend();
  const handler = makeHandler({ kv: makeKv(kvClient), resend });
  const res = mockRes();
  await handler(mockReq({ email: 'not-an-email' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_email');
});

test('POST unknown email returns 200 + no email sent (enum-resistant)', async () => {
  const kvClient = fakeKvClient();
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ kv: makeKv(kvClient), resend });
  const res = mockRes();
  await handler(mockReq({ email: 'unknown@example.com' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(sends.length, 0);
  // Also: no auth token was stored
  const tokenKeys = Array.from(kvClient._store.keys()).filter(k => k.startsWith('auth_token:'));
  assert.strictEqual(tokenKeys.length, 0);
});

test('POST known email returns 200 + email sent + token stored', async () => {
  const kvClient = fakeKvClient();
  const kv = makeKv(kvClient);
  await kv.setUser('alex@example.com', { email: 'alex@example.com', state_version: 1 });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ kv, resend });
  const res = mockRes();
  await handler(mockReq({ email: 'alex@example.com' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].to, 'alex@example.com');
  assert.ok(sends[0].html.includes('/account/verify?token='));
  const tokenKeys = Array.from(kvClient._store.keys()).filter(k => k.startsWith('auth_token:'));
  assert.strictEqual(tokenKeys.length, 1);
});

test('POST 6 times — 6th gets 429', async () => {
  const kvClient = fakeKvClient();
  const kv = makeKv(kvClient);
  await kv.setUser('alex@example.com', { email: 'alex@example.com', state_version: 1 });
  const { resend } = makeMockResend();
  const handler = makeHandler({ kv, resend });

  for (let i = 0; i < 5; i++) {
    const res = mockRes();
    await handler(mockReq({ email: 'alex@example.com' }), res);
    assert.strictEqual(res.statusCode, 200, `request ${i + 1} should be 200`);
  }
  const res6 = mockRes();
  await handler(mockReq({ email: 'alex@example.com' }), res6);
  assert.strictEqual(res6.statusCode, 429);
  assert.strictEqual(res6.body.error, 'too_many_requests');
});
