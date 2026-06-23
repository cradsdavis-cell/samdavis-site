'use strict';
// Env that lib/auth.js (loaded transitively via api/account/book.js) expects at require time.
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-yes';
process.env.BASE_URL = 'https://crads-ai.com';
const test = require('node:test');
const assert = require('node:assert');
const { bookSession, bookingSkuFor } = require('../api/account/book');

const NOW = Date.parse('2026-06-23T00:00:00Z');
const FUTURE = '2026-06-25T14:00:00+10:00';
const PAST = '2026-06-20T14:00:00+10:00';

function fakes(overrides = {}) {
  const calls = { setUser: [], createBooking: [] };
  const kv = { setUser: async (email, rec) => { calls.setUser.push({ email, rec }); } };
  const cal = {
    findBookingByStripeSession: overrides.findBooking || (async () => ({ ok: true, body: { data: [] } })),
    createBooking: overrides.createBooking || (async (args) => { calls.createBooking.push(args); return { ok: true, status: 200, body: { id: 'bk_1' } }; }),
  };
  const skus = { getSku: () => ({ cal_event_type_id: 777 }) };
  return { kv, cal, skus, calls };
}

function blockUser(used = 1) {
  return { email: 'sam@findyourpeople.tech', name: 'Sam', state: 'between-s1-s2',
    engagements: [{ type: 'coaching-block', sessions_total: 4, sessions_used: used }] };
}

test('books a prepaid session, decrements balance, never calls Stripe', async () => {
  const { kv, cal, skus, calls } = fakes();
  const user = blockUser(1);
  const r = await bookSession({ kv, cal, skus, user, slotIso: FUTURE, now: NOW });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(calls.createBooking.length, 1);
  assert.strictEqual(calls.createBooking[0].eventTypeId, 777);
  assert.strictEqual(calls.createBooking[0].email, 'sam@findyourpeople.tech');
  assert.strictEqual(user.engagements[0].sessions_used, 2); // drawn down
  assert.strictEqual(calls.setUser.length, 1);
});

test('refuses when no sessions remain (completed block)', async () => {
  const { kv, cal, skus, calls } = fakes();
  const user = { email: 'x@y.com', state: 'post-s4-decision',
    engagements: [{ type: 'coaching-block', sessions_total: 4, sessions_used: 4, completed: true }] };
  const r = await bookSession({ kv, cal, skus, user, slotIso: FUTURE, now: NOW });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error, 'no_sessions_remaining');
  assert.strictEqual(calls.createBooking.length, 0); // never reaches Cal
});

test('rejects an invalid / past slot before touching Cal', async () => {
  const { kv, cal, skus, calls } = fakes();
  const bad = await bookSession({ kv, cal, skus, user: blockUser(1), slotIso: 'not-a-date', now: NOW });
  assert.strictEqual(bad.status, 400);
  const past = await bookSession({ kv, cal, skus, user: blockUser(1), slotIso: PAST, now: NOW });
  assert.strictEqual(past.status, 400);
  assert.strictEqual(past.error, 'slot_in_past');
  assert.strictEqual(calls.createBooking.length, 0);
});

test('dedupes a double-booked slot (409)', async () => {
  const { kv, cal, skus } = fakes({ findBooking: async () => ({ ok: true, body: { data: [{ id: 'existing' }] } }) });
  const r = await bookSession({ kv, cal, skus, user: blockUser(1), slotIso: FUTURE, now: NOW });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error, 'duplicate_booking');
});

test('maps a Cal slot collision to 409 slot_unavailable (no decrement)', async () => {
  const { kv, cal, skus, calls } = fakes({ createBooking: async () => ({ ok: false, status: 409, body: {} }) });
  const user = blockUser(1);
  const r = await bookSession({ kv, cal, skus, user, slotIso: FUTURE, now: NOW });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error, 'slot_unavailable');
  assert.strictEqual(user.engagements[0].sessions_used, 1); // unchanged
  assert.strictEqual(calls.setUser.length, 0);
});

test('retainer client books with no balance decrement', async () => {
  const { kv, cal, skus, calls } = fakes();
  const user = { email: 'r@y.com', name: 'R', state: 'retainer-active',
    engagements: [{ type: 'continuation-retainer', active: true }] };
  const r = await bookSession({ kv, cal, skus, user, slotIso: FUTURE, now: NOW });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sku, 'continuation-retainer');
  assert.strictEqual(calls.setUser.length, 0); // nothing to decrement
});

test('bookingSkuFor prefers the active block, falls back to retainer', () => {
  assert.strictEqual(bookingSkuFor({ activeBlock: { type: 'coaching-block' } }), 'coaching-block');
  assert.strictEqual(bookingSkuFor({ activeBlock: null, isRetainer: true }), 'continuation-retainer');
  assert.strictEqual(bookingSkuFor({ activeBlock: null, isRetainer: false }), null);
});
