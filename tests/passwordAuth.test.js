'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
const { makeLoginHandler, makeRegisterHandler, makeSetPasswordHandler } = require('../lib/passwordAuth');
const { hashPassword } = require('../lib/auth');

function fakeKv(seed = {}) {
  const users = { ...seed }; const tokens = {}; let throttle = {};
  return {
    _users: users, _tokens: tokens,
    async getUser(e) { return users[e] || null; },
    async setUser(e, r) { users[e] = r; },
    async getAuthToken(t) { return tokens[t] || null; },
    async setAuthToken(t, d) { tokens[t] = d; },
    async deleteAuthToken(t) { delete tokens[t]; },
    async incrementThrottle(e) { throttle[e] = (throttle[e] || 0) + 1; return throttle[e]; },
  };
}
function res() {
  return { _s: 0, _j: null, _h: {}, status(c){this._s=c;return this;}, json(o){this._j=o;return this;},
    setHeader(k,v){this._h[k]=v;}, end(){return this;} };
}

test('register creates a brand-new account + signs in', async () => {
  const kv = fakeKv();
  const r = res();
  await makeRegisterHandler({ kv })({ method: 'POST', headers: {}, body: { email: 'new@x.com', password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 200);
  assert.ok(kv._users['new@x.com'].password_hash);
  assert.strictEqual(kv._users['new@x.com'].state, 'onboarding-incomplete');
  assert.match(r._h['Set-Cookie'], /session_jwt=/);
});

test('register REJECTS an existing account (takeover guard)', async () => {
  const kv = fakeKv({ 'abbey@x.com': { email: 'abbey@x.com', state: 'between-s1-s2' } });
  const r = res();
  await makeRegisterHandler({ kv })({ method: 'POST', headers: {}, body: { email: 'abbey@x.com', password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 409);
  assert.ok(!kv._users['abbey@x.com'].password_hash, 'must not set a password on an existing account');
});

test('register rejects weak password', async () => {
  const r = res();
  await makeRegisterHandler({ kv: fakeKv() })({ method: 'POST', headers: {}, body: { email: 'a@x.com', password: 'short' } }, r);
  assert.strictEqual(r._s, 400);
});

test('login succeeds with correct password, fails generically otherwise', async () => {
  const { hash, salt } = hashPassword('longenough10');
  const kv = fakeKv({ 'u@x.com': { email: 'u@x.com', password_hash: hash, password_salt: salt, state: 'pre-s1' } });
  const ok = res();
  await makeLoginHandler({ kv })({ method: 'POST', headers: {}, body: { email: 'u@x.com', password: 'longenough10' } }, ok);
  assert.strictEqual(ok._s, 200);
  assert.match(ok._h['Set-Cookie'], /session_jwt=/);
  const bad = res();
  await makeLoginHandler({ kv })({ method: 'POST', headers: {}, body: { email: 'u@x.com', password: 'nope' } }, bad);
  assert.strictEqual(bad._s, 401);
  const missing = res();
  await makeLoginHandler({ kv })({ method: 'POST', headers: {}, body: { email: 'ghost@x.com', password: 'whatever10' } }, missing);
  assert.strictEqual(missing._s, 401);
  assert.deepStrictEqual(bad._j, missing._j, 'no enumeration: identical error');
});

const future = () => new Date(Date.now() + 900000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

test('set-password via reset token sets hash + bumps state_version + burns token', async () => {
  const kv = fakeKv({ 'c@x.com': { email: 'c@x.com', state: 'pre-s1', state_version: 1 } });
  kv._tokens['tok1'] = { email: 'c@x.com', purpose: 'set-password', expires_at: future() };
  const r = res();
  await makeSetPasswordHandler({ kv })({ method: 'POST', headers: {}, body: { token: 'tok1', password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 200);
  assert.ok(kv._users['c@x.com'].password_hash);
  assert.strictEqual(kv._users['c@x.com'].state_version, 2, 'state_version bumped to evict other sessions');
  assert.strictEqual(kv._tokens['tok1'], undefined, 'token burned');
});

test('set-password REJECTS an expired token (no hash set, token burned)', async () => {
  const kv = fakeKv({ 'c@x.com': { email: 'c@x.com', state: 'pre-s1' } });
  kv._tokens['old'] = { email: 'c@x.com', purpose: 'set-password', expires_at: past() };
  const r = res();
  await makeSetPasswordHandler({ kv })({ method: 'POST', headers: {}, body: { token: 'old', password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 401);
  assert.ok(!kv._users['c@x.com'].password_hash, 'expired token must not set a password');
  assert.strictEqual(kv._tokens['old'], undefined, 'expired token burned');
});

test('set-password REJECTS a wrong-purpose (verify/welcome) token — no takeover', async () => {
  const kv = fakeKv({ 'c@x.com': { email: 'c@x.com', state: 'pre-s1' } });
  kv._tokens['vtok'] = { email: 'c@x.com', purpose: 'verify', expires_at: future() };
  const r = res();
  await makeSetPasswordHandler({ kv })({ method: 'POST', headers: {}, body: { token: 'vtok', password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 401);
  assert.ok(!kv._users['c@x.com'].password_hash, 'a verify/welcome token must not set a password');
});

test('set-password via valid session sets hash', async () => {
  const { signSession } = require('../lib/auth');
  const kv = fakeKv({ 's@x.com': { email: 's@x.com', state: 'pre-s1' } });
  const jwt = signSession({ email: 's@x.com', state_version: 1 });
  const r = res();
  await makeSetPasswordHandler({ kv })({ method: 'POST', headers: { cookie: `session_jwt=${jwt}` }, body: { password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 200);
  assert.ok(kv._users['s@x.com'].password_hash);
});

test('set-password with neither token nor session is 401', async () => {
  const r = res();
  await makeSetPasswordHandler({ kv: fakeKv() })({ method: 'POST', headers: {}, body: { password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 401);
});

test('email is normalized to lowercase (one account per email regardless of case)', async () => {
  const kv = fakeKv();
  const r = res();
  await makeRegisterHandler({ kv })({ method: 'POST', headers: {}, body: { email: 'Mixed@Case.COM', password: 'longenough10' } }, r);
  assert.strictEqual(r._s, 200);
  assert.ok(kv._users['mixed@case.com'], 'stored under the lowercased key');
  const l = res();
  await makeLoginHandler({ kv })({ method: 'POST', headers: {}, body: { email: 'MIXED@case.com', password: 'longenough10' } }, l);
  assert.strictEqual(l._s, 200, 'different-case login resolves to the same account');
});
