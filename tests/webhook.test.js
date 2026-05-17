'use strict';
const test = require('node:test');
const assert = require('node:assert');

let stripeStub, calStub, emailStub;

require.cache[require.resolve('../lib/stripe')] = {
  exports: {
    constructWebhookEvent: (raw, sig) => stripeStub.constructWebhookEvent(raw, sig),
    refundSession: (sid) => stripeStub.refundSession(sid),
  },
};
require.cache[require.resolve('../lib/cal')] = {
  exports: {
    findBookingByStripeSession: (sid) => calStub.findBookingByStripeSession(sid),
    createBooking: (args) => calStub.createBooking(args),
  },
};
require.cache[require.resolve('../lib/email')] = {
  exports: {
    sendRaceLossEmail: (args) => emailStub.sendRaceLossEmail(args),
    sendSamAlert: (args) => emailStub.sendSamAlert(args),
  },
};

const handler = require('../api/stripe/webhook');

function mockReq(rawBody, signature = 'sig_test') {
  return {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    rawBody: Buffer.from(rawBody),
  };
}
function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

function fakeSessionEvent(overrides = {}) {
  return {
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_test_abc',
      payment_intent: 'pi_test_abc',
      amount_total: 50000,
      customer_email: 'alex@example.com',
      metadata: {
        sku: 'coaching-block',
        slot_iso: '2026-05-20T15:00:00+10:00',
        name: 'Alex Mills',
        cal_event_type_id: '12346',
      },
      ...overrides,
    } },
  };
}

test('400 on invalid signature', async () => {
  stripeStub = { constructWebhookEvent: () => { throw new Error('bad sig'); } };
  calStub = {}; emailStub = {};
  const res = mockRes();
  await handler(mockReq('{}', 'bad'), res);
  assert.strictEqual(res.statusCode, 400);
});

test('books slot via Cal on checkout.session.completed', async () => {
  let bookingArgs = null;
  stripeStub = { constructWebhookEvent: () => fakeSessionEvent() };
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
    createBooking: async (args) => { bookingArgs = args; return { ok: true, status: 201, body: { id: 999 } }; },
  };
  emailStub = {};
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(bookingArgs, {
    eventTypeId: 12346,
    slotIso: '2026-05-20T15:00:00+10:00',
    name: 'Alex Mills',
    email: 'alex@example.com',
    stripeSessionId: 'cs_test_abc',
    sku: 'coaching-block',
  });
});

test('idempotent: skip if Cal already has booking for session', async () => {
  stripeStub = { constructWebhookEvent: () => fakeSessionEvent() };
  let createCalled = false;
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [{ id: 999 }] } }),
    createBooking: async () => { createCalled = true; return { ok: true, body: {} }; },
  };
  emailStub = {};
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(createCalled, false, 'should not call createBooking when already exists');
});

test('race-loss: 409 from Cal triggers refund + race-loss email + Sam alert', async () => {
  let refunded = null, raceMailed = null, alerted = null;
  stripeStub = {
    constructWebhookEvent: () => fakeSessionEvent(),
    refundSession: async (sid) => { refunded = sid; return { id: 're_test' }; },
  };
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
    createBooking: async () => ({ ok: false, status: 409, body: { error: 'slot_unavailable' } }),
  };
  emailStub = {
    sendRaceLossEmail: async (args) => { raceMailed = args; return { id: 'em1' }; },
    sendSamAlert: async (args) => { alerted = args; return { id: 'em2' }; },
  };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(refunded, 'cs_test_abc');
  assert.strictEqual(raceMailed.to, 'alex@example.com');
  assert.ok(alerted.subject.toLowerCase().includes('race'));
});

test('Cal 5xx returns 500 so Stripe retries', async () => {
  stripeStub = { constructWebhookEvent: () => fakeSessionEvent() };
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
    createBooking: async () => ({ ok: false, status: 503, body: { error: 'cal_down' } }),
  };
  emailStub = { sendSamAlert: async () => ({ id: 'em' }) };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 500);
});

test('non-checkout.session.completed event returns 200 no-op', async () => {
  stripeStub = { constructWebhookEvent: () => ({ type: 'charge.succeeded', data: { object: {} } }) };
  calStub = {}; emailStub = {};
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
});
