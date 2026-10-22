'use strict';
const test = require('node:test');
const assert = require('node:assert');

let stripeStub, calStub, emailStub;
const ACCOUNT_CALLS = [];

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
    sendRoadmapConfirmationEmail: (args) => emailStub.sendRoadmapConfirmationEmail(args),
    getResendClient: () => ({ emails: { send: async () => ({ id: 'em-stub' }) } }),
  },
};
require.cache[require.resolve('../lib/createOrUpdateUser')] = {
  exports: {
    createOrUpdateUser: async (args) => { ACCOUNT_CALLS.push(args); return { created: false, user: null }; },
  },
};
// An in-memory KV behind the real makeKv, so the referral writes run for real.
const KV_STORE = new Map();
const { makeKv: realMakeKv } = require('../lib/kv');
const memKv = realMakeKv({
  get: async (k) => (KV_STORE.has(k) ? JSON.parse(KV_STORE.get(k)) : null),
  set: async (k, v) => { KV_STORE.set(k, JSON.stringify(v)); return 'OK'; },
  del: async (k) => (KV_STORE.delete(k) ? 1 : 0),
  incr: async () => 1,
  expire: async () => 1,
  keys: async (pattern) => [...KV_STORE.keys()].filter((k) => k.startsWith(pattern.replace('*', ''))),
});
require.cache[require.resolve('../lib/kv')] = {
  exports: {
    defaultKv: () => memKv,
    makeKv: () => memKv,
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

test('free order (100%-off code): happy path books with no PaymentIntent', async () => {
  let created = null;
  stripeStub = {
    constructWebhookEvent: () => fakeSessionEvent({ payment_intent: null, amount_total: 0 }),
    retrievePaymentIntent: async () => { throw new Error('must not be called'); },
    updatePaymentIntentMetadata: async () => { throw new Error('must not be called'); },
  };
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
    createBooking: async (args) => { created = args; return { ok: true, body: { data: { id: 1 } } }; },
  };
  emailStub = {};
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(created, 'booking created');
});

test('free order (100%-off code) losing the slot race: no refund attempt, Sam alerted, 200', async () => {
  let refundCalled = false, raceMailed = false, alerted = null;
  stripeStub = {
    constructWebhookEvent: () => fakeSessionEvent({ payment_intent: null, amount_total: 0 }),
    refundSession: async () => { refundCalled = true; throw new Error('no payment to refund'); },
  };
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
    createBooking: async () => ({ ok: false, status: 409, body: { error: 'slot_unavailable' } }),
  };
  emailStub = {
    sendRaceLossEmail: async () => { raceMailed = true; },
    sendSamAlert: async (args) => { alerted = args; return { id: 'em2' }; },
  };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(refundCalled, false);
  assert.strictEqual(raceMailed, false);
  assert.ok(alerted.subject.includes('free booking lost its slot'));
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

// --- roadmap (2026-09-28): no account, one confirmation email instead ---
function roadmapEvent() {
  return fakeSessionEvent({ metadata: { sku: 'roadmap', slot_iso: '2026-10-01T10:00:00+10:00', name: 'Rhi Jones', cal_event_type_id: '120' } });
}
const okCal = () => ({
  findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
  createBooking: async () => ({ ok: true, status: 201, body: { data: { id: 1 } } }),
});

test('roadmap: booked slot sends the confirmation email and creates NO account', async () => {
  ACCOUNT_CALLS.length = 0;
  let mailed = null;
  stripeStub = { constructWebhookEvent: () => roadmapEvent() };
  calStub = okCal();
  emailStub = { sendRoadmapConfirmationEmail: async (a) => { mailed = a; return { id: 'em' }; } };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.booked, true);
  assert.deepStrictEqual(mailed, { to: 'alex@example.com', name: 'Rhi Jones', slotIso: '2026-10-01T10:00:00+10:00' });
  assert.strictEqual(ACCOUNT_CALLS.length, 0, 'no welcome email / portal account for a roadmap buyer');
});

test('time zone: the session metadata zone reaches Cal and the roadmap confirmation', async () => {
  let bookingArgs = null; let mailed = null;
  stripeStub = { constructWebhookEvent: () => fakeSessionEvent({ metadata: { sku: 'roadmap', slot_iso: '2026-10-01T10:00:00+10:00', name: 'Rhi Jones', cal_event_type_id: '120', time_zone: 'Europe/London' } }) };
  calStub = { ...okCal(), createBooking: async (a) => { bookingArgs = a; return { ok: true, status: 201, body: { data: { id: 1 } } }; } };
  emailStub = { sendRoadmapConfirmationEmail: async (a) => { mailed = a; return { id: 'em' }; } };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(bookingArgs.timeZone, 'Europe/London');
  assert.strictEqual(mailed.timeZone, 'Europe/London');
});

test('roadmap: a failed confirmation email alerts Sam and still returns 200', async () => {
  let alerted = null;
  stripeStub = { constructWebhookEvent: () => roadmapEvent() };
  calStub = okCal();
  emailStub = {
    sendRoadmapConfirmationEmail: async () => { throw new Error('resend down'); },
    sendSamAlert: async (a) => { alerted = a; },
  };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(/roadmap confirmation/.test(alerted.subject));
});

test('setup SKUs unchanged: a walkthrough still creates the account and sends no roadmap email', async () => {
  ACCOUNT_CALLS.length = 0;
  let mailed = false;
  stripeStub = { constructWebhookEvent: () => fakeSessionEvent({ metadata: { sku: 'walkthrough', slot_iso: '2026-10-01T10:00:00+10:00', name: 'A', cal_event_type_id: '109' } }) };
  calStub = okCal();
  emailStub = { sendRoadmapConfirmationEmail: async () => { mailed = true; } };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(ACCOUNT_CALLS.length, 1);
  assert.strictEqual(ACCOUNT_CALLS[0].sku, 'walkthrough');
  assert.strictEqual(mailed, false);
});

// ---- partner referrals (2026-10-16) ----------------------------------------

function refEvent({ sku = 'guided-setup', id = 'cs_ref_1', email = 'buyer@example.com', ref, text, eventType = '106', discount } = {}) {
  const metadata = { sku, slot_iso: '2026-10-20T10:00:00+10:00', name: 'Bea Buyer', cal_event_type_id: eventType };
  if (ref) { metadata.ref = ref; metadata.ref_at = '2026-10-10T00:00:00.000Z'; }
  if (discount) metadata.ref_discount_aud = String(discount);
  return fakeSessionEvent({
    id, customer_email: email, metadata,
    custom_fields: text ? [{ key: 'referrer', text: { value: text } }] : [{ key: 'referrer', text: { value: null } }],
  });
}

test('referral: a guided setup bought through /r/nim is recorded pending-s1 and the Cal booking carries the ref', async () => {
  KV_STORE.clear();
  let bookingArgs = null;
  const alerts = [];
  stripeStub = { constructWebhookEvent: () => refEvent({ ref: 'nim' }) };
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
    createBooking: async (a) => { bookingArgs = a; return { ok: true, status: 201, body: { data: { id: 1 } } }; },
  };
  emailStub = { sendSamAlert: async (a) => { alerts.push(a); } };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(bookingArgs.ref, 'nim');
  const rec = JSON.parse(KV_STORE.get('referral:cs_ref_1'));
  assert.strictEqual(rec.referrer, 'nim');
  assert.strictEqual(rec.status, 'pending-s1');
  assert.strictEqual(rec.amount_aud, 100);
  assert.strictEqual(rec.buyer_email, 'buyer@example.com');
  assert.ok(alerts.some((a) => /referral recorded: nim/.test(a.subject)));
});

test('referral: two-sided (21 Oct), the record and the alert note the buyer\'s A$100 off', async () => {
  KV_STORE.clear();
  const alerts = [];
  calStub = okCal();
  emailStub = { sendSamAlert: async (a) => { alerts.push(a); } };
  stripeStub = { constructWebhookEvent: () => refEvent({ id: 'cs_two', ref: 'nim', discount: 100 }) };
  await handler(mockReq('{}'), mockRes());
  const rec = JSON.parse(KV_STORE.get('referral:cs_two'));
  assert.strictEqual(rec.buyer_discount_aud, 100);
  assert.strictEqual(rec.amount_aud, 100);
  assert.ok(alerts.some((a) => /buyer got A\$100 off/.test(a.body)));
});

test('referral: roadmap first, guided setup later on another device, still pays the partner', async () => {
  KV_STORE.clear();
  calStub = okCal();
  emailStub = { sendRoadmapConfirmationEmail: async () => ({}), sendSamAlert: async () => {} };
  stripeStub = { constructWebhookEvent: () => refEvent({ sku: 'roadmap', id: 'cs_rm', ref: 'nim', eventType: '200' }) };
  await handler(mockReq('{}'), mockRes());
  assert.strictEqual(KV_STORE.has('referral:cs_rm'), false, 'the roadmap itself pays nothing');
  assert.strictEqual(JSON.parse(KV_STORE.get('ref_attr:buyer@example.com')).slug, 'nim');

  stripeStub = { constructWebhookEvent: () => refEvent({ id: 'cs_gs' }) };
  await handler(mockReq('{}'), mockRes());
  const rec = JSON.parse(KV_STORE.get('referral:cs_gs'));
  assert.strictEqual(rec.referrer, 'nim');
  assert.strictEqual(rec.via, 'earlier-booking');
});

test('referral: a "Who sent you?" answer alone is recorded needs-review', async () => {
  KV_STORE.clear();
  calStub = okCal();
  emailStub = { sendSamAlert: async () => {} };
  stripeStub = { constructWebhookEvent: () => refEvent({ id: 'cs_txt', text: 'Nim Zappert' }) };
  await handler(mockReq('{}'), mockRes());
  const rec = JSON.parse(KV_STORE.get('referral:cs_txt'));
  assert.strictEqual(rec.status, 'needs-review');
  assert.strictEqual(rec.suggested, 'nim');
});

test('referral: a plain guided setup writes no referral and sends no referral alert', async () => {
  KV_STORE.clear();
  const alerts = [];
  calStub = okCal();
  emailStub = { sendSamAlert: async (a) => { alerts.push(a); } };
  stripeStub = { constructWebhookEvent: () => refEvent({ id: 'cs_plain' }) };
  await handler(mockReq('{}'), mockRes());
  assert.strictEqual([...KV_STORE.keys()].some((k) => k.startsWith('referral:')), false);
  assert.strictEqual(alerts.length, 0);
});

test('referral: a webhook retry does not duplicate or overwrite the record', async () => {
  KV_STORE.clear();
  calStub = okCal();
  emailStub = { sendSamAlert: async () => {} };
  stripeStub = { constructWebhookEvent: () => refEvent({ id: 'cs_dup', ref: 'nim' }) };
  await handler(mockReq('{}'), mockRes());
  const first = KV_STORE.get('referral:cs_dup');
  // Sam marks it owed by hand between deliveries; a late retry must not reset it.
  const rec = JSON.parse(first); rec.status = 'owed'; KV_STORE.set('referral:cs_dup', JSON.stringify(rec));
  await handler(mockReq('{}'), mockRes());
  assert.strictEqual(JSON.parse(KV_STORE.get('referral:cs_dup')).status, 'owed');
});

// ---- booking source (2026-10-17, lib/attribution.js) -----------------------

test('booking source: the dropdown answer and utm_source reach the Cal booking', async () => {
  KV_STORE.clear();
  let bookingArgs = null;
  calStub = {
    findBookingByStripeSession: async () => ({ ok: true, body: { data: [] } }),
    createBooking: async (a) => { bookingArgs = a; return { ok: true, status: 201, body: { data: { id: 1 } } }; },
  };
  emailStub = { sendRoadmapConfirmationEmail: async () => ({}), sendSamAlert: async () => {} };
  stripeStub = { constructWebhookEvent: () => fakeSessionEvent({
    id: 'cs_src', customer_email: 'src@example.com',
    metadata: { sku: 'roadmap', slot_iso: '2026-10-20T10:00:00+10:00', name: 'S', cal_event_type_id: '200', utm_source: 'linkedin' },
    custom_fields: [{ key: 'referrer', text: { value: null } }, { key: 'heardfrom', dropdown: { value: 'whatsapp' } }],
  }) };
  const res = mockRes();
  await handler(mockReq('{}'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(bookingArgs.heardFrom, 'whatsapp');
  assert.strictEqual(bookingArgs.utmSource, 'linkedin');
});
