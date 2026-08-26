// cardOnFile.test.js — billing_enabled as a FACT, not a radio (2026-08-26).
// Under arrears a month is delivered before a cent arrives, so this is the only
// thing between the platform and a month given away.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasSavedCard } = require('../lib/cardOnFile');

const stripeWith = ({ customers = [], cards = [], throws = false } = {}) => ({
  customers: { list: async () => { if (throws) throw new Error('stripe is down'); return { data: customers }; } },
  paymentMethods: { list: async () => ({ data: cards }) },
});
const CARD = { id: 'pm_1', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } };

test('a card on the PLATFORM customer is found', async () => {
  const r = await hasSavedCard({ stripe: stripeWith({ customers: [{ id: 'cus_1', created: 1, metadata: { crads_ai: 'true' } }], cards: [CARD] }), email: 'A@B.co' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.card.brand, r.card.last4], ['visa', '4242']);
});

test('no customer and no card are both simply "no card", not errors', async () => {
  assert.equal((await hasSavedCard({ stripe: stripeWith({}), email: 'a@b.co' })).card, null);
  assert.equal((await hasSavedCard({ stripe: stripeWith({ customers: [{ id: 'c', created: 1 }], cards: [] }), email: 'a@b.co' })).card, null);
});

test('a Stripe outage FAILS CLOSED: no card, and the caller must not open the gate', async () => {
  // The alternative is an outage silently letting everyone create minerals.
  const r = await hasSavedCard({ stripe: stripeWith({ throws: true }), email: 'a@b.co' });
  assert.equal(r.ok, false);
  assert.equal(r.card, null);
  assert.match(r.why, /stripe is down/);
});

test('a checkout-minted orphan is used rather than ignored: that is where the card is', async () => {
  // A customer created by Stripe Checkout carries no crads_ai metadata but does
  // carry the saved card. Ignoring it reports "no card" for someone who has one.
  const r = await hasSavedCard({ stripe: stripeWith({ customers: [{ id: 'cus_orphan', created: 1 }], cards: [CARD] }), email: 'a@b.co' });
  assert.equal(r.card.last4, '4242');
});

test('deleted customers are skipped', async () => {
  const r = await hasSavedCard({ stripe: stripeWith({ customers: [{ id: 'cus_dead', created: 1, deleted: true }], cards: [CARD] }), email: 'a@b.co' });
  assert.equal(r.card, null);
});
