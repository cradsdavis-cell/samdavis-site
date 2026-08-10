'use strict';
// tests/accountId.test.js — ownership ruling 5: the account has a permanent
// name and the email is only a label. The failure this prevents: an email
// change orphaning every mineral that account owns, with no way to reconnect
// them because the ownership records point at a hash nobody can produce again.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { makeKv } = require('../lib/kv');
const { ensureAccountId, newAccountId, ID_RE } = require('../lib/accountId');
const { requireAuth } = require('../lib/account');
const { signSession } = require('../lib/auth');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => (store.has(k) ? store.get(k) : null),
    set: async (k, v) => { store.set(k, v); },
    del: async (k) => { store.delete(k); },
    incr: async () => 1, expire: async () => {},
    keys: async (p) => [...store.keys()].filter((k) => k.startsWith(p.replace('*', ''))),
  };
}
const mockRes = () => {
  const res = { statusCode: 0, headers: {}, redirectTo: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = () => res;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.redirect = (c, u) => { res.statusCode = c; res.redirectTo = u; return res; };
  return res;
};

test('ids are unique, shaped, and never reissued once set', async () => {
  const kv = makeKv(fakeKvClient());
  assert.match(newAccountId(), ID_RE);
  assert.notEqual(newAccountId(), newAccountId());

  const user = { email: 'sam@x.com', state_version: 1 };
  const first = await ensureAccountId(kv, user);
  assert.match(first, ID_RE);
  assert.equal(await ensureAccountId(kv, user), first, 'stable across calls');
  const reloaded = await kv.getUser('sam@x.com');
  assert.equal(reloaded.id, first, 'and persisted, not just held in memory');
});

test('an account that predates the id acquires one on first load, without a migration', async () => {
  const kv = makeKv(fakeKvClient());
  await kv.setUser('old@x.com', { email: 'old@x.com', state_version: 1 });   // no id, like Sam's
  const res = mockRes();
  const jwt = signSession({ email: 'old@x.com', state_version: 1 });
  const user = await requireAuth({ kv, req: { method: 'GET', headers: { cookie: `session_jwt=${jwt}` } }, res });
  assert.ok(user, 'still signs in');
  assert.match(user.id, ID_RE, 'and now has a permanent name');
  assert.equal((await kv.getUser('old@x.com')).id, user.id, 'written back once');
});

test('a garbage id is replaced rather than trusted', async () => {
  const kv = makeKv(fakeKvClient());
  const user = { email: 'sam@x.com', id: 'not-an-account-id' };
  const id = await ensureAccountId(kv, user);
  assert.match(id, ID_RE);
  assert.notEqual(id, 'not-an-account-id');
});

test('new accounts are born with one, on both creation paths', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  for (const f of ['lib/createOrUpdateUser.js', 'lib/passwordAuth.js']) {
    const src = readFileSync(join(__dirname, '..', f), 'utf8');
    assert.ok(src.includes('newAccountId()'), `${f} creates accounts without a permanent id`);
  }
});

test('an id-less account still works everywhere: nothing may REQUIRE the id yet', async () => {
  // Deploy safety, the same rule the session registry follows. Minerals are
  // keyed to ids only from the moment they register, which is after this ships.
  const kv = makeKv(fakeKvClient());
  const user = { email: 'nobody@x.com' };
  const id = await ensureAccountId(kv, { ...user });
  assert.match(id, ID_RE);
  assert.equal(await ensureAccountId(kv, null), '', 'a missing record is not a crash');
  assert.equal(await ensureAccountId(kv, {}), '', 'nor is a record with no email');
});
