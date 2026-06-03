'use strict';
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-here';
const test = require('node:test');
const assert = require('node:assert');
const { makeHandler } = require('../lib/profileUpdate');
const { makeKv } = require('../lib/kv');
const { signSession } = require('../lib/auth');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async () => 1, incr: async () => 1, expire: async () => 1,
    keys: async (p) => Array.from(store.keys()).filter(k => k.startsWith(p.replace('*', ''))),
  };
}

function mockReq(body) {
  const jwt = signSession({ email: 'a@b.com', state_version: 1 });
  return { method: 'POST', body, headers: { cookie: `session_jwt=${jwt}` } };
}
function mockRes() {
  const r = { statusCode: 200, body: null, headers: {}, redirectTo: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.redirect = (code, url) => { r.statusCode = code; r.redirectTo = url; return r; };
  r.end = () => r;
  return r;
}

test('updates name + worksheet + redirects to /account/profile', async () => {
  const kv = makeKv(fakeKvClient());
  await kv.setUser('a@b.com', { email: 'a@b.com', state: 'pre-s1', state_version: 1, onboarding: { context_worksheet: {} } });
  const handler = makeHandler({ kv });
  const res = mockRes();
  await handler(mockReq({
    name: 'Alex Mills',
    business: 'Social media agency',
    current_pain: 'Time',
    current_tools: ['gmail', 'notion'],
    desired_outcome: 'More time',
    technical_level: 'somewhat',
  }), res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.redirectTo, '/account/profile');
  const u = await kv.getUser('a@b.com');
  assert.strictEqual(u.name, 'Alex Mills');
  assert.strictEqual(u.onboarding.context_worksheet.business, 'Social media agency');
  // Invariant: state_version is NOT bumped by profile updates
  assert.strictEqual(u.state_version, 1);
  assert.strictEqual(u.state, 'pre-s1');
});
