'use strict';
const test = require('node:test');
const assert = require('node:assert');

let mockResult = null;
let mockThrow = false;
let calledWith = null;
require.cache[require.resolve('../lib/stripe')] = {
  exports: {
    invoiceForSession: async (id) => {
      calledWith = id;
      if (mockThrow) throw new Error('stripe down');
      return mockResult;
    },
  },
};
const handler = require('../api/invoice-link');

function mockReq(query, method = 'GET') { return { method, query }; }
function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test('returns the hosted invoice for a paid session', async () => {
  mockThrow = false;
  mockResult = { number: 'DLSHBTNR-0001', url: 'https://invoice.stripe.com/i/x' };
  const res = mockRes();
  await handler(mockReq({ session_id: 'cs_live_abc123' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { invoice: mockResult });
  assert.strictEqual(calledWith, 'cs_live_abc123');
});

test('returns invoice:null when there is nothing to link (free or unpaid)', async () => {
  mockThrow = false;
  mockResult = null;
  const res = mockRes();
  await handler(mockReq({ session_id: 'cs_test_abc' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { invoice: null });
});

test('400 on a missing or malformed session id', async () => {
  for (const q of [{}, { session_id: 'in_123' }, { session_id: 'cs_live_../../x' }]) {
    const res = mockRes();
    await handler(mockReq(q), res);
    assert.strictEqual(res.statusCode, 400);
  }
});

test('502 without the upstream error when Stripe fails', async () => {
  mockThrow = true;
  const res = mockRes();
  await handler(mockReq({ session_id: 'cs_live_abc' }), res);
  assert.strictEqual(res.statusCode, 502);
  assert.deepStrictEqual(res.body, { error: 'upstream' });
});

test('405 on non-GET', async () => {
  const res = mockRes();
  await handler(mockReq({ session_id: 'cs_live_abc' }, 'POST'), res);
  assert.strictEqual(res.statusCode, 405);
});
