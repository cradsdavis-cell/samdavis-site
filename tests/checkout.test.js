'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Mock env
process.env.BASE_URL = 'https://crads-ai.com';
process.env.STRIPE_PRICE_SINGLE = 'price_test_single';
process.env.CAL_EVENT_TYPE_SINGLE = '101';
process.env.CAL_EVENT_TYPE_DISCOVERY = '100';

// Stub lib/stripe + lib/cal BEFORE requiring handler
require.cache[require.resolve('../lib/stripe')] = {
  exports: {
    createCheckoutSession: async (args) => ({ id: 'cs_test_123', url: 'https://stripe.test/cs_test_123', _args: args }),
  },
};
require.cache[require.resolve('../lib/cal')] = {
  exports: {
    createBooking: async (args) => ({ ok: true, status: 201, body: { data: { id: 555, _args: args } } }),
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
