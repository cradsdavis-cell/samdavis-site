'use strict';
// QA finding 46: /access?org=<handle> bounced an unauthenticated visitor to
// /account/login and dropped the org, so an emailed invitation died at the
// sign-in it forced. These pin the whole return-to path, including the part
// that matters more than the feature: that it cannot be pointed off-origin.
const test = require('node:test');
const assert = require('node:assert');
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const { makeLoginHandler } = require('../lib/passwordAuth');
const { hashPassword } = require('../lib/auth');
const { requireAuth } = require('../lib/account');

function fakeKv(seed = {}) {
  const users = { ...seed }; const tokens = {}; const throttle = {};
  return {
    _sessions: {},
    async getUser(e) { return users[e] || null; },
    async setUser(e, r) { users[e] = r; },
    async getAuthToken(t) { return tokens[t] || null; },
    async setAuthToken(t, d) { tokens[t] = d; },
    async deleteAuthToken(t) { delete tokens[t]; },
    async incrementThrottle(k) { throttle[k] = (throttle[k] || 0) + 1; return throttle[k]; },
    async setSession(e, sid, d) { this._sessions[`${e}:${sid}`] = d; },
    async getSession(e, sid) { return this._sessions[`${e}:${sid}`] || null; },
    async listSessions(e) { return Object.entries(this._sessions).filter(([k]) => k.startsWith(`${e}:`)).map(([, v]) => v); },
    async deleteSession(e, sid) { delete this._sessions[`${e}:${sid}`]; },
  };
}

function fakeRes() {
  return {
    statusCode: 0, body: null, redirected: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    redirect(code, loc) { this.statusCode = code; this.redirected = loc; return this; },
  };
}

function userWithPassword(email, password) {
  const { hash, salt } = hashPassword(password);
  return { email, password_hash: hash, password_salt: salt, state_version: 1 };
}

// ---- requireAuth carries the destination out ----

test('requireAuth bounces an anonymous visitor to login carrying where they were going', async () => {
  const res = fakeRes();
  const user = await requireAuth({ kv: fakeKv(), req: { url: '/access?org=coogee-labs', headers: {} }, res });
  assert.strictEqual(user, null);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.redirected, '/account/login?next=%2Faccess%3Forg%3Dcoogee-labs');
});

test('requireAuth falls back to a bare login page when the URL is not safe to return to', async () => {
  const res = fakeRes();
  await requireAuth({ kv: fakeKv(), req: { url: '//evil.example', headers: {} }, res });
  assert.strictEqual(res.redirected, '/account/login');
});

test('requireAuth does not bounce a signed-in visitor back to login in a loop', async () => {
  const res = fakeRes();
  await requireAuth({ kv: fakeKv(), req: { url: '/account/login?next=%2Fapp', headers: {} }, res });
  assert.strictEqual(res.redirected, '/account/login');
});

// ---- login honours it, and only when it is safe ----

test('password login returns the caller to where they were bounced from', async () => {
  const kv = fakeKv({ 'a@b.com': userWithPassword('a@b.com', 'correct-horse-battery') });
  const res = fakeRes();
  await makeLoginHandler({ kv })({
    method: 'POST', headers: {},
    body: { email: 'a@b.com', password: 'correct-horse-battery', next: '/access?org=coogee-labs' },
  }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.redirect, '/access?org=coogee-labs');
});

test('password login refuses to redirect off-origin and falls back to /app', async () => {
  for (const hostile of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
    const kv = fakeKv({ 'a@b.com': userWithPassword('a@b.com', 'correct-horse-battery') });
    const res = fakeRes();
    await makeLoginHandler({ kv })({
      method: 'POST', headers: {},
      body: { email: 'a@b.com', password: 'correct-horse-battery', next: hostile },
    }, res);
    assert.strictEqual(res.body.redirect, '/account', `should not honour ${hostile}`);
  }
});

test('password login with no next still lands on /account', async () => {
  const kv = fakeKv({ 'a@b.com': userWithPassword('a@b.com', 'correct-horse-battery') });
  const res = fakeRes();
  await makeLoginHandler({ kv })({
    method: 'POST', headers: {}, body: { email: 'a@b.com', password: 'correct-horse-battery' },
  }, res);
  assert.strictEqual(res.body.redirect, '/account');
});
