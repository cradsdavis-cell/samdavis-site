'use strict';
// tests/sessions.test.js — arc A3: every sign-in is a listed, revocable
// device, and NOBODY gets locked out by the deploy. The load-bearing rule:
// a sid-less legacy JWT keeps working; only an explicitly revoked sid dies.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { makeKv } = require('../lib/kv');
const { signSession, verifySession } = require('../lib/auth');
const { issueSession, sessionWelcome, uaFamily } = require('../lib/sessions');
const { requireAuth } = require('../lib/account');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => (store.has(k) ? store.get(k) : null),
    set: async (k, v) => { store.set(k, v); },
    del: async (k) => { store.delete(k); },
    incr: async (k) => { const v = (store.get(k) || 0) + 1; store.set(k, v); return v; },
    expire: async () => {},
    keys: async (p) => Array.from(store.keys()).filter((k) => k.startsWith(p.replace('*', ''))),
    _store: store,
  };
}
function mockRes() {
  const res = { statusCode: 0, body: null, headers: {}, redirectTo: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.redirect = (c, u) => { res.statusCode = c; res.redirectTo = u; return res; };
  return res;
}
const reqWith = (jwt) => ({ method: 'GET', headers: { cookie: `session_jwt=${jwt}` } });
const seedUser = (kv, email, sv = 1) => kv.setUser(email, { email, state_version: sv });

test('issue registers the device and the sid rides the JWT', async () => {
  const kv = makeKv(fakeKvClient());
  const { jwt, sid } = await issueSession({ kv, email: 'sam@x.com', stateVersion: 2, userAgent: 'Mozilla/5.0 (Macintosh) Chrome/126 Safari/537' });
  assert.equal(verifySession(jwt).sid, sid);
  assert.equal(verifySession(jwt).state_version, 2);
  const rows = await kv.listSessions('sam@x.com');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sid, sid);
  assert.equal(rows[0].label, 'Chrome on Mac', 'named for a human');
});

test('DEPLOY SAFETY: a legacy sid-less JWT sails through requireAuth', async () => {
  const kv = makeKv(fakeKvClient());
  await seedUser(kv, 'sam@x.com');
  const legacy = signSession({ email: 'sam@x.com', state_version: 1 });   // pre-A3 shape
  const res = mockRes();
  const user = await requireAuth({ kv, req: reqWith(legacy), res });
  assert.ok(user, 'nobody signs the world out on deploy');
  assert.equal(user.email, 'sam@x.com');
});

test('revoking a sid kills exactly that session, and only that one', async () => {
  const kv = makeKv(fakeKvClient());
  await seedUser(kv, 'sam@x.com');
  const a = await issueSession({ kv, email: 'sam@x.com', stateVersion: 1, userAgent: 'laptop' });
  const b = await issueSession({ kv, email: 'sam@x.com', stateVersion: 1, userAgent: 'phone' });
  await kv.deleteSession('sam@x.com', a.sid);

  const resA = mockRes();
  assert.equal(await requireAuth({ kv, req: reqWith(a.jwt), res: resA }), null, 'the revoked device is out');
  assert.equal(resA.redirectTo, '/account/login');
  const resB = mockRes();
  assert.ok(await requireAuth({ kv, req: reqWith(b.jwt), res: resB }), 'the other device is untouched');
});

test('sign-out-everywhere: the state_version bump kills sid and sid-less sessions alike', async () => {
  const kv = makeKv(fakeKvClient());
  await seedUser(kv, 'sam@x.com', 1);
  const withSid = await issueSession({ kv, email: 'sam@x.com', stateVersion: 1 });
  const legacy = signSession({ email: 'sam@x.com', state_version: 1 });
  const u = await kv.getUser('sam@x.com'); u.state_version = 2; await kv.setUser('sam@x.com', u);
  assert.equal(await requireAuth({ kv, req: reqWith(withSid.jwt), res: mockRes() }), null);
  assert.equal(await requireAuth({ kv, req: reqWith(legacy), res: mockRes() }), null);
});

test('an active session touches last_seen; sessionWelcome names the legacy case', async () => {
  const kv = makeKv(fakeKvClient());
  const { sid } = await issueSession({ kv, email: 'sam@x.com', stateVersion: 1 });
  const row = await kv.getSession('sam@x.com', sid);
  row.last_seen = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await kv.setSession('sam@x.com', sid, row);
  const sw = await sessionWelcome({ kv, payload: { email: 'sam@x.com', sid } });
  assert.equal(sw.welcome, true);
  await new Promise((r) => setTimeout(r, 10));
  const touched = await kv.getSession('sam@x.com', sid);
  assert.ok(Date.parse(touched.last_seen) > Date.now() - 60 * 1000, 'last_seen moved');
  assert.deepEqual(await sessionWelcome({ kv, payload: { email: 'a@b.c' } }), { welcome: true, legacy: true });
});

test('the app session is labelled as the app; ua families read like humans wrote them', async () => {
  const kv = makeKv(fakeKvClient());
  await issueSession({ kv, email: 'sam@x.com', stateVersion: 1, label: 'Crads-AI app', userAgent: 'crads-app' });
  const [row] = await kv.listSessions('sam@x.com');
  assert.equal(row.label, 'Crads-AI app');
  assert.equal(uaFamily('Mozilla/5.0 Windows Firefox/128.0'), 'Firefox');
  // Reworded 2026-08-12 (QA finding 57). "Unknown device" and the old bare
  // "Browser" were the same mistake: on a page whose job is deciding which
  // sessions to kill, the unrecognised row must say something the reader can
  // act on. What matters is that it is not a bare noun pretending to be a
  // browser, so pin the property rather than the sentence.
  assert.match(uaFamily(''), /no browser name/i);
  assert.notStrictEqual(uaFamily('').trim(), 'Browser');
});

test('every login flow issues a REGISTERED session (no sign-in the Devices page cannot see)', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const files = ['lib/passwordAuth.js', 'lib/authVerifyToken.js', 'api/auth/google/callback.js', 'lib/appHandoff.js'];
  for (const f of files) {
    const src = readFileSync(join(__dirname, '..', f), 'utf8');
    assert.ok(src.includes('issueSession'), `${f} still issues an unregistered session`);
  }
  // and the rolling refresh preserves the device identity
  const account = readFileSync(join(__dirname, '..', 'lib/account.js'), 'utf8');
  assert.ok(account.includes('sessionWelcome'), 'requireAuth checks the registry');
  assert.ok(/sid: payload\.sid/.test(account), 'a refresh keeps the same sid: same device, never a new one');
});
