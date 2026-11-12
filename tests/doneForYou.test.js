// tests/doneForYou.test.js - Done for you (2026-11-12, decisions/log 2026-11-11):
// A$1,500, a 60-minute call at checkout, Sam builds, a 30-minute handover
// booked from the portal at least a week later. The welcome email carries the
// intake form; the portal names the handover, not "session 2".
'use strict';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-32-chars-minimum-ok-yes';
process.env.BASE_URL = 'https://crads-ai.com';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSchtaCHWwVZzt2nFHKM8fxRfkvh-jR4rDlN3D_gNMwr3CCmrg/viewform';

function fresh() {
  delete require.cache[require.resolve('../lib/skus')];
  return require('../lib/skus');
}

test('done for you: A$1,500, live price, a 60 + 30 minute pair of Cal types, an account to book the handover', () => {
  for (const k of ['CAL_EVENT_TYPE_DONE_FOR_YOU_S1', 'CAL_EVENT_TYPE_DONE_FOR_YOU_S2', 'STRIPE_PRICE_DONE_FOR_YOU', 'DONE_FOR_YOU_FORM_URL']) delete process.env[k];
  const { getSku, calEventTypeIdFor, isPurchasable, createsAccount, intakeFormUrlFor } = fresh();
  const sku = getSku('done-for-you');
  assert.ok(isPurchasable('done-for-you'));
  assert.ok(createsAccount('done-for-you'));
  assert.strictEqual(sku.price_aud, 1500);
  assert.strictEqual(sku.stripe_price_id, 'price_1Uam4q2MeTK4rlQYcILZamo7');
  assert.strictEqual(sku.stripe_product_id, 'prod_Vc04lU5oupu3m3');
  assert.deepStrictEqual(sku.sessions.map((s) => s.duration_min), [60, 30]);
  assert.strictEqual(calEventTypeIdFor('done-for-you', 1), 7880462);
  assert.strictEqual(calEventTypeIdFor('done-for-you', 2), 7880463);
  assert.strictEqual(intakeFormUrlFor('done-for-you'), FORM);
  assert.strictEqual(intakeFormUrlFor('guided-setup'), null);
});

test('done for you: the handover sits at least a week after the call', () => {
  const { sessionsForSku, minGapMsFor } = require('../lib/sessionBalance');
  assert.strictEqual(sessionsForSku('done-for-you'), 2);
  assert.strictEqual(minGapMsFor('done-for-you'), 7 * 24 * 60 * 60 * 1000);
});

test('done for you: the welcome email links the intake form and the handover sign-in', async () => {
  const { createOrUpdateUser } = require('../lib/createOrUpdateUser');
  const { makeKv } = require('../lib/kv');
  const store = new Map();
  const kv = makeKv({
    get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { store.delete(k); return 1; },
    incr: async (k) => { const c = parseInt(store.get(k) || '0', 10) + 1; store.set(k, String(c)); return c; },
    expire: async () => 1,
    keys: async (p) => Array.from(store.keys()).filter((k) => k.startsWith(p.replace('*', ''))),
  });
  const sent = [];
  await createOrUpdateUser({
    kv, resend: { emails: { send: async (o) => { sent.push(o); return { id: 'em' }; } } },
    email: 'dee@example.com', name: 'Dee Buyer', stripeCustomerId: 'cus_D',
    sku: 'done-for-you', stripeSessionId: 'cs_D', slotIso: '2026-11-20T03:00:00Z',
  });
  const u = await kv.getUser('dee@example.com');
  assert.strictEqual(u.state, 'pre-s1');
  assert.strictEqual(u.engagements[0].type, 'done-for-you');
  assert.strictEqual(u.engagements[0].sessions_total, 2);
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].subject, /Done for you/);
  assert.ok(sent[0].html.includes(FORM), 'the form link is in the email');
  assert.match(sent[0].html, /handover, at least a week after our call/);
  assert.doesNotMatch(sent[0].subject + sent[0].html, /—|session 2/);
});

test('done for you: the portal hero names the call and the handover', () => {
  const { renderHeroCard } = require('../lib/journeyTracker');
  const user = { state: 'pre-s1', engagements: [{ type: 'done-for-you', sessions_total: 2, sessions_used: 1, first_slot_iso: '2026-11-20T14:00:00+11:00' }] };
  const html = renderHeroCard({ user, nextSession: null, balance: { activeBlock: user.engagements[0], remaining: 1 } });
  assert.match(html, /Done for you/);
  assert.match(html, /Book the handover/);
  assert.match(html, /at least a week later/);
  assert.doesNotMatch(html, /interview|Session 1 of 2/);
});

test('done for you: the booking page, the offer card, the roadmap page and the nav all point at it', () => {
  const page = fs.readFileSync(path.join(ROOT, 'book/done-for-you.html'), 'utf8');
  assert.match(page, /window\.SKU_SLUG='done-for-you'/);
  assert.match(page, /A\$1,500/);
  assert.doesNotMatch(page, /—/);
  for (const rel of ['offer/index.html', 'book/roadmap.html']) {
    assert.match(fs.readFileSync(path.join(ROOT, rel), 'utf8'), /href="\/book\/done-for-you"/, `${rel} links the page`);
  }
  const { navHTML } = require('../lib/site');
  assert.match(navHTML('/'), /href="\/book\/done-for-you">Done for you</);
});
