'use strict';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
process.env.RESEND_FROM_EMAIL = 'Sam <hello@crads-ai.com>';
process.env.BASE_URL = 'https://crads-ai.com';

const test = require('node:test');
const assert = require('node:assert');
const { makeKv } = require('../lib/kv');
const { makeHandler, THROTTLE_LIMIT } = require('../lib/authRequestSignin');

// The login page offered "Email me a sign-in link instead" and posted to the
// password RESET endpoint. Following it set a new password and bumped
// state_version, which signs every other machine out — the desktop app included.
// These pin the sender that makes the button honest: a session-minting token,
// and nothing touched on the account.

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { const had = store.has(k); store.delete(k); return had ? 1 : 0; },
    incr: async (k) => { const n = parseInt(store.get(k) || '0') + 1; store.set(k, String(n)); return n; },
    expire: async () => 1,
    keys: async (p) => Array.from(store.keys()).filter(k => k.startsWith(p.replace('*', ''))),
    _store: store,
  };
}
function makeMockResend() {
  const sends = [];
  return { sends, resend: { emails: { send: async (a) => { sends.push(a); return { id: 'em_1' }; } } } };
}
const mockReq = (body, method = 'POST') => ({ method, body });
function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}
async function withUser(email = 'sam@example.com') {
  const kvClient = fakeKvClient();
  const kv = makeKv(kvClient);
  await kv.setUser(email, { email, state_version: 1, password_hash: 'h', password_salt: 's' });
  const { resend, sends } = makeMockResend();
  return { kv, kvClient, sends, handler: makeHandler({ kv, resend }) };
}

test('it mints a SIGNIN token, never a set-password one', async () => {
  const { kvClient, handler } = await withUser();
  await handler(mockReq({ email: 'sam@example.com' }), mockRes());
  const tokens = Array.from(kvClient._store.entries())
    .map(([k, v]) => { try { return JSON.parse(v); } catch { return null; } })
    .filter((v) => v && v.purpose);
  assert.strictEqual(tokens.length, 1);
  assert.strictEqual(tokens[0].purpose, 'signin',
    'a set-password purpose here would be the original bug wearing a new name');
});

test('the link goes to the session-minting consumer, not the password page', async () => {
  const { sends, handler } = await withUser();
  await handler(mockReq({ email: 'sam@example.com' }), mockRes());
  assert.match(sends[0].html, /\/api\/auth\/verify-token\?token=/);
  assert.ok(!/set-password/.test(sends[0].html), 'set-password is the reset flow, not this one');
  assert.match(sends[0].subject, /sign-in link/i);
});

test('it changes nothing on the account: no password, no state_version bump', async () => {
  const { kv, handler } = await withUser();
  const before = await kv.getUser('sam@example.com');
  await handler(mockReq({ email: 'sam@example.com' }), mockRes());
  const after = await kv.getUser('sam@example.com');
  assert.strictEqual(after.state_version, before.state_version,
    'bumping it here would sign the desktop app out, which is the whole bug');
  assert.strictEqual(after.password_hash, before.password_hash);
});

test('an unknown email gets the same 200 and the same words, and no mail', async () => {
  const { sends, handler } = await withUser();
  const res = mockRes();
  await handler(mockReq({ email: 'stranger@example.com' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.body.message, /If that email has an account/);
  assert.strictEqual(sends.length, 0);
});

test('the throttle is its own bucket, so it cannot deny the reset flow', async () => {
  const { kvClient, handler } = await withUser();
  for (let i = 0; i <= THROTTLE_LIMIT; i++) await handler(mockReq({ email: 'sam@example.com' }), mockRes());
  const res = mockRes();
  await handler(mockReq({ email: 'sam@example.com' }), res);
  assert.strictEqual(res.statusCode, 429);
  assert.ok(Array.from(kvClient._store.keys()).some((k) => k.includes('signin:')),
    'sharing the reset bucket would let one flow lock the other out');
});

test('a bad email is refused before any mail or token', async () => {
  const { sends, handler } = await withUser();
  const res = mockRes();
  await handler(mockReq({ email: 'not-an-email' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(sends.length, 0);
});
