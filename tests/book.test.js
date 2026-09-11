'use strict';
// Env that lib/auth.js (loaded transitively via api/account/book.js) expects at require time.
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-yes';
process.env.BASE_URL = 'https://crads-ai.com';
const test = require('node:test');
const assert = require('node:assert');
const { bookSession, bookingSkuFor, earliestAllowedMs } = require('../api/account/book');

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
  const skus = { calEventTypeIdFor: () => 777 };
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

test('booking advances the journey stage forward (pre-s1 -> between-s1-s2)', async () => {
  const { kv, cal, skus } = fakes();
  const user = { email: 'p@y.com', name: 'P', state: 'pre-s1',
    engagements: [{ type: 'coaching-block', sessions_total: 4, sessions_used: 1 }] };
  const r = await bookSession({ kv, cal, skus, user, slotIso: FUTURE, now: NOW });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(user.engagements[0].sessions_used, 2);
  assert.strictEqual(user.state, 'between-s1-s2'); // self-driving stage
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

// --- v4 guided setup (2026-09-09): two sessions, at least a day apart ---

function guidedUser(firstSlot = '2026-06-24T10:00:00+10:00') {
  return { email: 'g@y.com', name: 'G', state: 'pre-s1',
    engagements: [{ type: 'guided-setup', sessions_total: 2, sessions_used: 1, first_slot_iso: firstSlot }] };
}

test('guided setup: session 2 books from the portal and completes the balance', async () => {
  const { kv, cal, skus, calls } = fakes();
  const user = guidedUser('2026-06-24T10:00:00+10:00');
  const r = await bookSession({ kv, cal, skus, user, slotIso: '2026-06-26T10:00:00+10:00', now: NOW });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sku, 'guided-setup');
  assert.strictEqual(calls.createBooking.length, 1);
  assert.strictEqual(user.engagements[0].sessions_used, 2);
  assert.strictEqual(user.state, 'between-s1-s2');
});

test('guided setup: session 2 inside 24h of session 1 is refused as too_soon, Cal untouched', async () => {
  const { kv, cal, skus, calls } = fakes();
  const user = guidedUser('2026-06-24T10:00:00+10:00');
  const r = await bookSession({ kv, cal, skus, user, slotIso: '2026-06-25T09:00:00+10:00', now: NOW });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'too_soon');
  assert.strictEqual(r.earliest_iso, new Date(Date.parse('2026-06-24T10:00:00+10:00') + 86400000).toISOString());
  assert.strictEqual(calls.createBooking.length, 0);
  assert.strictEqual(user.engagements[0].sessions_used, 1);
});

test('guided setup: exactly 24h later is allowed; no first slot on record means no gate', async () => {
  const { kv, cal, skus } = fakes();
  const ok = await bookSession({ kv, cal, skus, user: guidedUser('2026-06-24T10:00:00+10:00'), slotIso: '2026-06-25T10:00:00+10:00', now: NOW });
  assert.strictEqual(ok.ok, true);
  const { kv: kv2, cal: cal2, skus: skus2 } = fakes();
  const u = guidedUser(); delete u.engagements[0].first_slot_iso;
  const ungated = await bookSession({ kv: kv2, cal: cal2, skus: skus2, user: u, slotIso: '2026-06-24T10:30:00+10:00', now: NOW });
  assert.strictEqual(ungated.ok, true);
  assert.strictEqual(earliestAllowedMs({ type: 'coaching-block', first_slot_iso: '2026-06-24T10:00:00+10:00' }), null, 'only the guided setup carries a gap');
});

test('guided setup: after both sessions nothing is left to book', async () => {
  const { kv, cal, skus, calls } = fakes();
  const user = { email: 'g@y.com', state: 'between-s1-s2', engagements: [{ type: 'guided-setup', sessions_total: 2, sessions_used: 2 }] };
  const r = await bookSession({ kv, cal, skus, user, slotIso: FUTURE, now: NOW });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(calls.createBooking.length, 0);
});

// --- v5 (2026-09-11): a SKU's sessions have different Cal types; the portal books session N's ---

test('the portal asks for session (used + 1)\'s Cal type: session 2 of a walkthrough, never session 1\'s', async () => {
  const asked = [];
  const { kv, cal, calls } = fakes();
  const skus = { calEventTypeIdFor: (sku, session) => { asked.push([sku, session]); return session === 2 ? 30302 : 60601; } };
  const user = { email: 'w@y.com', name: 'W', state: 'pre-s1',
    engagements: [{ type: 'walkthrough', sessions_total: 2, sessions_used: 1, first_slot_iso: '2026-06-24T10:00:00+10:00' }] };
  const r = await bookSession({ kv, cal, skus, user, slotIso: '2026-06-26T10:00:00+10:00', now: NOW });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sku, 'walkthrough');
  assert.strictEqual(r.session, 2);
  assert.deepStrictEqual(asked, [['walkthrough', 2]]);
  assert.strictEqual(calls.createBooking[0].eventTypeId, 30302);
  assert.strictEqual(user.engagements[0].sessions_used, 2);
});

test('walkthrough: session 2 inside 24h of session 1 is refused as too_soon, like the guided setup', async () => {
  const { kv, cal, skus, calls } = fakes();
  const user = { email: 'w@y.com', name: 'W', state: 'pre-s1',
    engagements: [{ type: 'walkthrough', sessions_total: 2, sessions_used: 1, first_slot_iso: '2026-06-24T10:00:00+10:00' }] };
  const r = await bookSession({ kv, cal, skus, user, slotIso: '2026-06-25T09:00:00+10:00', now: NOW });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'too_soon');
  assert.strictEqual(calls.createBooking.length, 0);
});

test('a legacy block asks for session (used + 1) too; the retainer always asks for session 1', async () => {
  const asked = [];
  const { kv, cal } = fakes();
  const skus = { calEventTypeIdFor: (sku, session) => { asked.push([sku, session]); return 777; } };
  await bookSession({ kv, cal, skus, user: blockUser(2), slotIso: FUTURE, now: NOW });
  await bookSession({ kv, cal, skus, user: { email: 'r@y.com', state: 'retainer-active', engagements: [] }, slotIso: FUTURE, now: NOW });
  assert.deepStrictEqual(asked, [['coaching-block', 3], ['continuation-retainer', 1]]);
});
