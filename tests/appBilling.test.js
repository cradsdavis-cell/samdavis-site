'use strict';
// tests/appBilling.test.js — arc A4. Personal billing is real; rock billing is
// STATED, never invented. The line this pins: no number appears on this page
// that the platform cannot actually answer for.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { billingView } = require('../lib/appBilling');

const SRC = readFileSync(join(__dirname, '..', 'api', 'app', 'billing.js'), 'utf8');

test('a linked customer gets a portal session that returns to /app/billing', async () => {
  const calls = [];
  const stripe = { billingPortal: { sessions: { create: async (a) => { calls.push(a); return { url: 'https://billing.stripe.com/x' }; } } } };
  const v = await billingView({ user: { email: 'a@b.c', stripe_customer_id: 'cus_1' }, stripe, baseUrl: 'https://crads-ai.com' });
  assert.equal(v.portalUrl, 'https://billing.stripe.com/x');
  assert.equal(calls[0].customer, 'cus_1');
  assert.equal(calls[0].return_url, 'https://crads-ai.com/app/billing', 'returns into the app, not the coaching page');
});

test('no linked customer is a calm fact, not an error; a Stripe failure is reported, not swallowed', async () => {
  const none = await billingView({ user: { email: 'a@b.c' }, stripe: {}, baseUrl: 'https://x.test' });
  assert.equal(none.portalUrl, null);
  assert.equal(none.portalError, null);
  assert.equal(none.linked, false);

  const angry = { billingPortal: { sessions: { create: async () => { throw new Error('no such customer'); } } } };
  const failed = await billingView({ user: { email: 'a@b.c', stripe_customer_id: 'cus_x' }, stripe: angry, baseUrl: 'https://x.test' });
  assert.equal(failed.portalUrl, null);
  assert.match(failed.portalError, /no such customer/);
});

test('rock billing is stated, never faked: no invented figures on the page', () => {
  assert.match(SRC, /Rocks you operate/, 'the card exists (ruling 10)');
  assert.match(SRC, /not itemised here yet/, 'and says plainly that it is not itemised');
  assert.match(SRC, /Nothing is being charged for these seats today/, 'and what that means for money');
  // the giveaway of a faked pane would be currency or per-seat arithmetic
  assert.ok(!/[$£€]\s?\d/.test(SRC), 'no money figure is printed');
  // strip HTML entities first: &#8217; is digits that mean an apostrophe
  const prose = SRC.replace(/&#\d+;/g, "'");
  assert.ok(!/\d+\s*(seats?|×|x)\s*[$£€]?\d/i.test(prose), 'no seat arithmetic');
  assert.ok(!/\btotal\b/i.test(prose), 'no total is claimed');
});

test('an unreadable rock list says so rather than claiming you operate none', () => {
  assert.match(SRC, /rocks === null/, 'the failure case is distinguished');
  assert.match(SRC, /Could not read which rocks/, 'and named');
  assert.ok(SRC.indexOf('Could not read which rocks') < SRC.indexOf('does not operate a rock'),
    'unreadable is checked before the empty case, so a dead read never reads as none');
});
