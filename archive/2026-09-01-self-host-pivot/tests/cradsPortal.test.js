// cradsPortal.test.js — the Crads-AI customer portal door.
//   node --test tests/cradsPortal.test.js
//
// The bug this exists because of: the billing design doc said /app/billing
// "already carries the Stripe portal link". It did not. That link lives on
// /account/subscription and points at user.stripe_customer_id, the COACHING
// customer. A Crads-AI customer is a different Stripe customer, keyed by email
// plus metadata crads_ai=true, so the same person can hold both and billing
// them from the wrong one would be worse than showing nothing at all.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cradsPortalUrl } = require('../lib/cradsPortal');

const stripeWith = ({ customers = [], sessionUrl = 'https://billing.stripe.com/p/session/x', onSearch, onCreate } = {}) => ({
  customers: { search: async (args) => { if (onSearch) onSearch(args); return { data: customers }; } },
  billingPortal: { sessions: { create: async (args) => { if (onCreate) onCreate(args); return { url: sessionUrl }; } } },
});

test('finds the PLATFORM customer, not the coaching one', async () => {
  let query = '';
  const r = await cradsPortalUrl({
    stripe: stripeWith({ customers: [{ id: 'cus_platform' }], onSearch: (a) => { query = a.query; } }),
    email: 'Person@Example.com ', returnUrl: 'https://crads-ai.com/app/billing',
  });
  assert.equal(r.url, 'https://billing.stripe.com/p/session/x');
  assert.match(query, /email:'person@example\.com'/, 'lowercased, trimmed');
  assert.match(query, /metadata\['crads_ai'\]:'true'/, 'the platform flag is what separates the two customers');
});

test('no platform customer means no button, not an error', async () => {
  const r = await cradsPortalUrl({ stripe: stripeWith({ customers: [] }), email: 'nobody@example.com', returnUrl: 'x' });
  assert.equal(r.url, null);
  assert.match(r.why, /no platform customer/);
});

test('a Stripe outage costs the button, never the page', async () => {
  const broken = { customers: { search: async () => { throw new Error('stripe is down'); } } };
  const r = await cradsPortalUrl({ stripe: broken, email: 'a@b.co', returnUrl: 'x' });
  assert.equal(r.url, null);
  assert.match(r.why, /stripe is down/);
});

test('an apostrophe in an address cannot break out of the search query', async () => {
  let query = '';
  await cradsPortalUrl({
    stripe: stripeWith({ customers: [{ id: 'c' }], onSearch: (a) => { query = a.query; } }),
    email: "o'brien@example.com", returnUrl: 'x',
  });
  assert.match(query, /o\\'brien@example\.com/);
});

test('the chosen portal configuration is passed, not Stripe\'s unconfigured default', async () => {
  let created = null;
  await cradsPortalUrl({
    stripe: stripeWith({ customers: [{ id: 'cus_1' }], onCreate: (a) => { created = a; } }),
    email: 'a@b.co', returnUrl: 'https://crads-ai.com/app/billing',
  });
  assert.equal(created.customer, 'cus_1');
  assert.equal(created.return_url, 'https://crads-ai.com/app/billing');
  assert.match(created.configuration, /^bpc_/, 'without this it silently runs on defaults nobody chose');
});

test('a missing stripe client or email is refused before any call', async () => {
  assert.equal((await cradsPortalUrl({ stripe: null, email: 'a@b.co' })).url, null);
  assert.equal((await cradsPortalUrl({ stripe: stripeWith({}), email: '' })).url, null);
});
