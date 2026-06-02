'use strict';
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-yes';
process.env.RESEND_FROM_EMAIL = 'sam@crads-ai.com';
process.env.BASE_URL = 'https://crads-ai.com';
const test = require('node:test');
const assert = require('node:assert');
const { createOrUpdateUser } = require('../lib/createOrUpdateUser');
const { makeKv } = require('../lib/kv');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { store.delete(k); return 1; },
    incr: async (k) => { const c = (parseInt(store.get(k) || '0') + 1); store.set(k, c.toString()); return c; },
    expire: async () => 1,
    keys: async (p) => Array.from(store.keys()).filter(k => k.startsWith(p.replace('*', ''))),
  };
}

test('creates user if not exists with state=onboarding-incomplete', async () => {
  const kv = makeKv(fakeKvClient());
  const sentEmails = [];
  await createOrUpdateUser({
    kv,
    resend: { emails: { send: async (o) => { sentEmails.push(o); return { id: 'em' }; } } },
    email: 'alex@example.com',
    name: 'Alex Mills',
    stripeCustomerId: 'cus_X',
    sku: 'coaching-block',
    stripeSessionId: 'cs_X',
  });
  const u = await kv.getUser('alex@example.com');
  assert.strictEqual(u.email, 'alex@example.com');
  assert.strictEqual(u.state, 'onboarding-incomplete');
  assert.strictEqual(u.state_version, 1);
  assert.strictEqual(u.engagements.length, 1);
  assert.strictEqual(u.engagements[0].type, 'coaching-block');
  assert.strictEqual(sentEmails.length, 1);
  assert.match(sentEmails[0].subject, /Welcome/);
});

test('appends engagement if user exists; preserves state', async () => {
  const kv = makeKv(fakeKvClient());
  await kv.setUser('alex@example.com', {
    email: 'alex@example.com',
    state: 'retainer-active',
    state_version: 1,
    engagements: [{ type: 'coaching-block', stripe_session_id: 'cs_prev' }],
  });
  const sentEmails = [];
  await createOrUpdateUser({
    kv,
    resend: { emails: { send: async (o) => { sentEmails.push(o); return { id: 'em' }; } } },
    email: 'alex@example.com',
    name: 'Alex',
    stripeCustomerId: 'cus_X',
    sku: 'group-block',
    stripeSessionId: 'cs_new',
  });
  const u = await kv.getUser('alex@example.com');
  assert.strictEqual(u.state, 'retainer-active');
  assert.strictEqual(u.engagements.length, 2);
  assert.strictEqual(u.engagements[1].type, 'group-block');
  assert.strictEqual(sentEmails.length, 0);
});

test('group-block purchase sets cohort_id', async () => {
  const kv = makeKv(fakeKvClient());
  await createOrUpdateUser({
    kv,
    resend: { emails: { send: async () => ({ id: 'em' }) } },
    email: 'cohort@example.com',
    name: 'Cohort Member',
    stripeCustomerId: 'cus_C',
    sku: 'group-block',
    stripeSessionId: 'cs_C',
    cohortId: 'jun-10-2026',
  });
  const u = await kv.getUser('cohort@example.com');
  assert.strictEqual(u.cohort_id, 'jun-10-2026');
});

test('retainer subscription sets active=true on engagement', async () => {
  const kv = makeKv(fakeKvClient());
  await createOrUpdateUser({
    kv,
    resend: { emails: { send: async () => ({ id: 'em' }) } },
    email: 'r@example.com',
    name: 'R',
    stripeCustomerId: 'cus_R',
    sku: 'continuation-retainer',
    stripeSubscriptionId: 'sub_R',
  });
  const u = await kv.getUser('r@example.com');
  assert.strictEqual(u.engagements[0].type, 'continuation-retainer');
  assert.strictEqual(u.engagements[0].active, true);
  assert.strictEqual(u.engagements[0].stripe_subscription_id, 'sub_R');
});
