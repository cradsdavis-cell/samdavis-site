'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Mock env (v2 SKU env-var names per 2026-06-02 coaching co-primary spec)
process.env.BASE_URL = 'https://crads-ai.com';
process.env.STRIPE_PRICE_SINGLE_V2 = 'price_test_single';
process.env.STRIPE_PRICE_BLOCK_V2_FULL = 'price_test_block';
process.env.STRIPE_PRICE_BLOCK_V2_PAY4_FIRST = 'price_test_block_pay4';
process.env.STRIPE_PRICE_GROUP = 'price_test_group';
process.env.STRIPE_PRICE_GROUP_PAY4 = 'price_test_group_pay4';
process.env.STRIPE_PRICE_RETAINER = 'price_test_retainer';
process.env.CAL_EVENT_TYPE_SINGLE = '101';
process.env.CAL_EVENT_TYPE_BLOCK = '102';
process.env.CAL_EVENT_TYPE_GROUP = '103';
process.env.CAL_EVENT_TYPE_RETAINER = '104';
process.env.CAL_EVENT_TYPE_DISCOVERY = '100';

// Stub lib/stripe + lib/cal BEFORE requiring handler.
// We capture stripe call args via a shared object so individual tests can
// assert the args passed (mode, slot_iso, etc.).
const STRIPE_CALLS = [];
function resetStripeCalls() { STRIPE_CALLS.length = 0; }
require.cache[require.resolve('../lib/stripe')] = {
  exports: {
    createCheckoutSession: async (args) => {
      STRIPE_CALLS.push(args);
      return { id: 'cs_test_123', url: 'https://stripe.test/cs_test_123', _args: args };
    },
  },
};
const CAL_CALLS = [];
function resetCalCalls() { CAL_CALLS.length = 0; }
require.cache[require.resolve('../lib/cal')] = {
  exports: {
    createBooking: async (args) => {
      CAL_CALLS.push(args);
      return { ok: true, status: 201, body: { data: { id: 555, _args: args } } };
    },
    findBookingByStripeSession: async () => ({ ok: true, status: 200, body: { data: [] } }),
  },
};
const handler = require('../api/checkout');

function mockReq(body, query = {}) {
  return { method: 'POST', body, query };
}
function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

// Pick a slot ~7 days out so it passes the future-date validation
const FUTURE_SLOT = new Date(Date.now() + 7 * 86400000).toISOString();

test('returns 400 if sku missing', async () => {
  const res = mockRes();
  await handler(mockReq({}), res);
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 if slot_iso missing', async () => {
  const res = mockRes();
  await handler(mockReq({ sku: 'single-session', email: 'a@b.com', name: 'X' }), res);
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 if email malformed', async () => {
  const res = mockRes();
  await handler(mockReq({ sku: 'single-session', slot_iso: FUTURE_SLOT, email: 'not-an-email', name: 'X' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_email');
});

test('returns 400 if slot_iso in past', async () => {
  const res = mockRes();
  const pastSlot = new Date(Date.now() - 86400000).toISOString();
  await handler(mockReq({ sku: 'single-session', slot_iso: pastSlot, email: 'a@b.com', name: 'X' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'slot_in_past');
});

test('OPTIONS preflight returns 204 with CORS headers', async () => {
  const res = mockRes();
  await handler({ method: 'OPTIONS', body: {}, query: {} }, res);
  assert.strictEqual(res.statusCode, 204);
  assert.ok(res.headers['access-control-allow-origin']);
});

test('creates Stripe session and returns checkout_url', async () => {
  const res = mockRes();
  await handler(mockReq({
    sku: 'single-session',
    slot_iso: FUTURE_SLOT,
    email: 'alex@example.com',
    name: 'Alex Mills',
  }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.checkout_url.startsWith('https://stripe.test/'));
});

test('returns 400 for unknown SKU', async () => {
  const res = mockRes();
  await handler(mockReq({
    sku: 'nonexistent',
    slot_iso: FUTURE_SLOT,
    email: 'a@b.com',
    name: 'X',
  }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'unknown_sku');
});

test('free discovery booking calls Cal directly', async () => {
  const res = mockRes();
  await handler(mockReq(
    { sku: 'discovery', slot_iso: FUTURE_SLOT, name: 'Alex', email: 'a@b.com' },
  ), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.free, true);
});

test('name sanitization strips URLs', async () => {
  // Side-effect test: createBooking captures args; we re-stub to capture
  const captured = {};
  require.cache[require.resolve('../lib/cal')] = {
    exports: {
      createBooking: async (args) => { Object.assign(captured, args); return { ok: true, status: 201, body: { data: { id: 999 } } }; },
      findBookingByStripeSession: async () => ({ ok: true, status: 200, body: { data: [] } }),
    },
  };
  delete require.cache[require.resolve('../api/checkout')];
  const h = require('../api/checkout');
  const res = mockRes();
  await h(mockReq({ sku: 'discovery', slot_iso: FUTURE_SLOT, name: 'Sam https://evil.com/phish', email: 'a@b.com' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(!/https?:/.test(captured.name), `name "${captured.name}" should have URL stripped`);
});

// --- Group Block + Continuation Retainer (no-Cal / subscription SKUs) ---

test('group-block: returns 200, Stripe called, slot_iso optional', async () => {
  resetStripeCalls(); resetCalCalls();
  const res = mockRes();
  await handler(mockReq({
    sku: 'group-block',
    email: 'cohort@example.com',
    name: 'Cohort Founder',
    // intentionally omit slot_iso — cohort sessions are pre-blocked in GCal
  }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.checkout_url.startsWith('https://stripe.test/'));
  assert.strictEqual(STRIPE_CALLS.length, 1, 'Stripe.createCheckoutSession should be called once');
  const args = STRIPE_CALLS[0];
  assert.strictEqual(args.sku, 'group-block');
  assert.strictEqual(args.priceId, 'price_test_group');
  assert.strictEqual(args.mode, 'payment', 'group-block is one-time payment, not subscription');
  // Cal must NOT be called at checkout time for group-block
  assert.strictEqual(CAL_CALLS.length, 0, 'Cal.createBooking should NOT be called for group-block');
});

test('group-block-pay4: returns 200 with pay4 price, no Cal call', async () => {
  resetStripeCalls(); resetCalCalls();
  const res = mockRes();
  await handler(mockReq({
    sku: 'group-block-pay4',
    email: 'cohort@example.com',
    name: 'Cohort Founder',
  }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(STRIPE_CALLS.length, 1);
  const args = STRIPE_CALLS[0];
  assert.strictEqual(args.sku, 'group-block-pay4');
  assert.strictEqual(args.priceId, 'price_test_group_pay4');
  assert.strictEqual(args.mode, 'payment');
  assert.strictEqual(CAL_CALLS.length, 0);
});

test('group-block: rejects invalid email even though slot_iso optional', async () => {
  resetStripeCalls();
  const res = mockRes();
  await handler(mockReq({
    sku: 'group-block',
    email: 'not-an-email',
    name: 'X',
  }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_email');
  assert.strictEqual(STRIPE_CALLS.length, 0);
});

test('group-block: rejects missing name even though slot_iso optional', async () => {
  resetStripeCalls();
  const res = mockRes();
  await handler(mockReq({
    sku: 'group-block',
    email: 'a@b.com',
    // missing name
  }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(STRIPE_CALLS.length, 0);
});

test('continuation-retainer: returns 200 with subscription mode, no Cal call', async () => {
  resetStripeCalls(); resetCalCalls();
  const res = mockRes();
  await handler(mockReq({
    sku: 'continuation-retainer',
    email: 'retainer@example.com',
    name: 'Retainer Client',
  }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(STRIPE_CALLS.length, 1);
  const args = STRIPE_CALLS[0];
  assert.strictEqual(args.sku, 'continuation-retainer');
  assert.strictEqual(args.priceId, 'price_test_retainer');
  assert.strictEqual(args.mode, 'subscription', 'retainer must use Stripe subscription mode');
  assert.strictEqual(CAL_CALLS.length, 0, 'Cal.createBooking should NOT be called for retainer');
});

test('single-session: still uses payment mode + requires slot_iso (regression)', async () => {
  resetStripeCalls();
  const res = mockRes();
  await handler(mockReq({
    sku: 'single-session',
    slot_iso: FUTURE_SLOT,
    email: 'alex@example.com',
    name: 'Alex',
  }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(STRIPE_CALLS.length, 1);
  const args = STRIPE_CALLS[0];
  assert.strictEqual(args.mode, 'payment');
  assert.strictEqual(args.slotIso, FUTURE_SLOT);
});

test('single-session: still rejects missing slot_iso (regression — non-NO_CAL SKU)', async () => {
  resetStripeCalls();
  const res = mockRes();
  await handler(mockReq({
    sku: 'single-session',
    email: 'alex@example.com',
    name: 'Alex',
  }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_slot_iso');
});
