'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeKv } = require('../lib/kv');

function fakeKv() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v, opts) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { const had = store.has(k); store.delete(k); return had ? 1 : 0; },
    incr: async (k) => { const cur = parseInt(store.get(k) || '0'); const next = cur + 1; store.set(k, next.toString()); return next; },
    expire: async (k, secs) => 1,
    keys: async (pattern) => Array.from(store.keys()).filter(k => k.startsWith(pattern.replace('*', ''))),
    _store: store,
  };
}

test('getUser returns null if not found', async () => {
  const kv = makeKv(fakeKv());
  assert.strictEqual(await kv.getUser('missing@example.com'), null);
});

test('setUser then getUser roundtrips', async () => {
  const kv = makeKv(fakeKv());
  await kv.setUser('alex@example.com', { email: 'alex@example.com', state: 'pre-s1' });
  const u = await kv.getUser('alex@example.com');
  assert.deepStrictEqual(u, { email: 'alex@example.com', state: 'pre-s1' });
});

test('setAuthToken sets with TTL', async () => {
  const fake = fakeKv();
  const kv = makeKv(fake);
  await kv.setAuthToken('tok123', { email: 'a@b.com', expires_at: '2026-06-03T11:00:00Z' }, 900);
  const t = await kv.getAuthToken('tok123');
  assert.strictEqual(t.email, 'a@b.com');
});

test('listUsers returns all user records', async () => {
  const kv = makeKv(fakeKv());
  await kv.setUser('a@b.com', { email: 'a@b.com' });
  await kv.setUser('c@d.com', { email: 'c@d.com' });
  const users = await kv.listUsers();
  assert.strictEqual(users.length, 2);
});

test('incrementThrottle returns count', async () => {
  const kv = makeKv(fakeKv());
  const n1 = await kv.incrementThrottle('a@b.com');
  const n2 = await kv.incrementThrottle('a@b.com');
  assert.strictEqual(n1, 1);
  assert.strictEqual(n2, 2);
});
