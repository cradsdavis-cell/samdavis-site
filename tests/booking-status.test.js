'use strict';
const test = require('node:test');
const assert = require('node:assert');

let mockCalResult = { ok: true, body: { data: [{ id: 1, status: 'ACCEPTED' }] } };
require.cache[require.resolve('../lib/cal')] = {
  exports: { findBookingByStripeSession: async () => mockCalResult },
};
const handler = require('../api/booking-status');

function mockReq(query) { return { method: 'GET', query }; }
function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test('returns confirmed:true when Cal has booking with the session id', async () => {
  mockCalResult = { ok: true, body: { data: [{ id: 1, status: 'ACCEPTED' }] } };
  const res = mockRes();
  await handler(mockReq({ session_id: 'cs_test_abc' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.confirmed, true);
});

test('returns confirmed:false when Cal returns empty', async () => {
  mockCalResult = { ok: true, body: { data: [] } };
  const res = mockRes();
  await handler(mockReq({ session_id: 'cs_test_abc' }), res);
  assert.strictEqual(res.body.confirmed, false);
});

test('returns 400 if session_id missing', async () => {
  const res = mockRes();
  await handler(mockReq({}), res);
  assert.strictEqual(res.statusCode, 400);
});
