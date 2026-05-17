'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Mock env
process.env.BASE_URL = 'https://samdavis.ai';
process.env.STRIPE_PRICE_SINGLE = 'price_test_single';
process.env.CAL_EVENT_TYPE_SINGLE = '101';

// Replace lib/stripe with stub before requiring handler
require.cache[require.resolve('../lib/stripe')] = {
  exports: {
    createCheckoutSession: async (args) => ({ id: 'cs_test_123', url: 'https://stripe.test/cs_test_123', _args: args }),
  },
};
const handler = require('../api/checkout');

function mockReq(body) {
  return { method: 'POST', body };
}
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('returns 400 if sku missing', async () => {
  const res = mockRes();
  await handler(mockReq({}), res);
  assert.strictEqual(res.statusCode, 400);
});

test('creates Stripe session and returns checkout_url', async () => {
  const res = mockRes();
  await handler(mockReq({
    sku: 'single-session',
    slot_iso: '2026-05-20T15:00:00+10:00',
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
    slot_iso: '2026-05-20T15:00:00+10:00',
    email: 'a@b.com',
    name: 'X',
  }), res);
  assert.strictEqual(res.statusCode, 400);
});

// === Task 16: free Discovery path ===
process.env.CAL_EVENT_TYPE_DISCOVERY = '100';

require.cache[require.resolve('../lib/cal')] = {
  exports: {
    createBooking: async (args) => ({ ok: true, status: 201, body: { id: 555, _args: args } }),
  },
};
// re-require handler with new mocks
delete require.cache[require.resolve('../api/checkout')];
const handlerFree = require('../api/checkout');

test('free discovery booking calls Cal directly, returns redirect path', async () => {
  const res = mockRes();
  const reqFree = {
    method: 'POST',
    query: { free: '1' },
    body: { sku: 'discovery', slot_iso: '2026-05-20T15:00:00+10:00', name: 'Alex', email: 'a@b.com' },
  };
  await handlerFree(reqFree, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.free, true);
});
