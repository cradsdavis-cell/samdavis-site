'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Mock env (v5 SKU names, 2026-09-11). Price IDs default from lib/skus.js;
// STRIPE_PRICE_WALKTHROUGH is set here to prove the env override wins.
process.env.BASE_URL = 'https://crads-ai.com';
process.env.STRIPE_PRICE_WALKTHROUGH = 'price_test_walkthrough';
delete process.env.STRIPE_PRICE_GUIDED_SETUP;
process.env.CAL_EVENT_TYPE_SINGLE = '101';
process.env.CAL_EVENT_TYPE_GUIDED_SETUP_S1 = '106';
process.env.CAL_EVENT_TYPE_GUIDED_SETUP_S2 = '107';
process.env.CAL_EVENT_TYPE_WALKTHROUGH_S1 = '109';
process.env.CAL_EVENT_TYPE_WALKTHROUGH_S2 = '110';
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
  await handler(mockReq({ sku: 'walkthrough', email: 'a@b.com', name: 'X' }), res);
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 if email malformed', async () => {
  const res = mockRes();
  await handler(mockReq({ sku: 'walkthrough', slot_iso: FUTURE_SLOT, email: 'not-an-email', name: 'X' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_email');
});

test('returns 400 if slot_iso in past', async () => {
  const res = mockRes();
  const pastSlot = new Date(Date.now() - 86400000).toISOString();
  await handler(mockReq({ sku: 'walkthrough', slot_iso: pastSlot, email: 'a@b.com', name: 'X' }), res);
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
    sku: 'walkthrough',
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

// --- v5 SKUs (2026-09-11): both two sessions; checkout books session 1's Cal type ---

test('guided-setup: payment mode, slot required, default price id, session 1 (60-min) Cal type', async () => {
  resetStripeCalls(); resetCalCalls();
  const res = mockRes();
  await handler(mockReq({ sku: 'guided-setup', slot_iso: FUTURE_SLOT, email: 'g@example.com', name: 'G' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(STRIPE_CALLS.length, 1);
  const args = STRIPE_CALLS[0];
  assert.strictEqual(args.sku, 'guided-setup');
  assert.strictEqual(args.priceId, 'price_1UDZF62MeTK4rlQYWqYrGVnJ', 'live price id is the in-code default');
  assert.strictEqual(args.calEventTypeId, 106);
  assert.strictEqual(args.slotIso, FUTURE_SLOT);
  assert.ok(!('mode' in args) || args.mode === undefined || args.mode === 'payment', 'no subscription mode survives');
  assert.strictEqual(CAL_CALLS.length, 0, 'Cal is booked by the webhook, never at checkout');
});

test('guided-setup: rejects a missing slot (no out-of-band SKU survives)', async () => {
  const res = mockRes();
  await handler(mockReq({ sku: 'guided-setup', email: 'g@example.com', name: 'G' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_slot_iso');
});

test('walkthrough: env override wins over the default price id, session 1 (60-min) Cal type, never session 2', async () => {
  resetStripeCalls();
  const res = mockRes();
  await handler(mockReq({ sku: 'walkthrough', slot_iso: FUTURE_SLOT, email: 'w@example.com', name: 'W' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(STRIPE_CALLS[0].priceId, 'price_test_walkthrough');
  assert.strictEqual(STRIPE_CALLS[0].calEventTypeId, 109);
});

test('retired SKUs cannot be bought: working-session, coaching-block, single-session, continuation-retainer are unknown_sku', async () => {
  for (const sku of ['working-session', 'coaching-block', 'coaching-block-pay4', 'single-session', 'continuation-retainer']) {
    resetStripeCalls();
    const res = mockRes();
    await handler(mockReq({ sku, slot_iso: FUTURE_SLOT, email: 'x@example.com', name: 'X' }), res);
    assert.strictEqual(res.statusCode, 400, sku);
    assert.strictEqual(res.body.error, 'unknown_sku', sku);
    assert.strictEqual(STRIPE_CALLS.length, 0, `${sku} reached Stripe`);
  }
});

test('lib/skus: calEventTypeIdFor resolves per session, and legacy slugs for the portal', () => {
  process.env.CAL_EVENT_TYPE_BLOCK = '102';
  process.env.CAL_EVENT_TYPE_WORKING_SESSION = '108';
  const { calEventTypeIdFor, isPurchasable, getSku, sessionLabelFor, sessionCountFor } = require('../lib/skus');
  assert.strictEqual(calEventTypeIdFor('coaching-block'), 102);
  assert.strictEqual(calEventTypeIdFor('coaching-block', 3), 102, 'legacy: one type for every session');
  assert.strictEqual(calEventTypeIdFor('working-session'), 108);
  assert.strictEqual(calEventTypeIdFor('guided-setup'), 106);
  assert.strictEqual(calEventTypeIdFor('guided-setup', 2), 107);
  assert.strictEqual(calEventTypeIdFor('walkthrough', 2), 110);
  assert.throws(() => calEventTypeIdFor('walkthrough', 3), /has 2 sessions, not 3/);
  assert.throws(() => calEventTypeIdFor('walkthrough', 0), /Invalid session number/);
  assert.strictEqual(isPurchasable('coaching-block'), false);
  assert.strictEqual(isPurchasable('working-session'), false);
  assert.strictEqual(isPurchasable('guided-setup'), true);
  assert.strictEqual(isPurchasable('walkthrough'), true);
  assert.throws(() => getSku('coaching-block'), /Unknown SKU/);
  assert.throws(() => getSku('working-session'), /Unknown SKU/);
  const g = getSku('guided-setup');
  assert.strictEqual(g.session_count, 2);
  assert.strictEqual(g.price_aud, 700);
  assert.deepStrictEqual(g.sessions.map((x) => x.duration_min), [60, 120]);
  assert.strictEqual(g.cal_event_type_id, g.sessions[0].cal_event_type_id, 'checkout books session 1');
  const w = getSku('walkthrough');
  assert.strictEqual(w.price_aud, 350);
  assert.deepStrictEqual(w.sessions.map((x) => x.duration_min), [60, 30]);
  assert.strictEqual(sessionLabelFor('walkthrough', 2), 'Walkthrough, session 2');
  assert.strictEqual(sessionCountFor('continuation-retainer'), null);
  delete process.env.CAL_EVENT_TYPE_WORKING_SESSION;
});
