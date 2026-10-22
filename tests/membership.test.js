'use strict';
// The membership checkout. What matters most: the founding price closes at 10
// for real, an included month only reaches someone holding Sam's invite for
// that email, and nobody ends up with two memberships.
const test = require('node:test');
const assert = require('node:assert');

process.env.BASE_URL = 'https://crads-ai.com';
process.env.STRIPE_PRICE_MEMBERSHIP_FOUNDING = 'price_f99';
process.env.STRIPE_PRICE_MEMBERSHIP_STANDARD = 'price_s149';
process.env.MEMBERSHIP_INVITE_SECRET = 'test-secret-test-secret-test-secret';

const m = require('../lib/membership');
const handler = require('../api/membership');

const NOW = 1_800_000_000;

test('a founding place: live subs hold one, a trial that lapsed unpaid gives it back', () => {
  assert.strictEqual(m.holdsFoundingPlace({ status: 'active' }), true);
  assert.strictEqual(m.holdsFoundingPlace({ status: 'trialing', trial_end: NOW }), true);
  assert.strictEqual(m.holdsFoundingPlace({ status: 'incomplete' }), false);
  assert.strictEqual(m.holdsFoundingPlace({ status: 'incomplete_expired' }), false);
  // Paid from day 1, then left: still counted (the 10 close for real).
  assert.strictEqual(m.holdsFoundingPlace({ status: 'canceled', trial_end: null, ended_at: NOW }), true);
  // Included month ended with no card: Stripe cancels at trial end. Not counted.
  assert.strictEqual(m.holdsFoundingPlace({ status: 'canceled', trial_end: NOW, ended_at: NOW }), false);
  // Billed after the included month, then left: counted.
  assert.strictEqual(m.holdsFoundingPlace({ status: 'canceled', trial_end: NOW, ended_at: NOW + 40 * 86400 }), true);
});

test('the offer switches to A$149 when the 10th founding place is taken', () => {
  assert.deepStrictEqual(m.currentOffer(0), { tier: 'founding', price_aud: 99, founding_left: 10 });
  assert.deepStrictEqual(m.currentOffer(9), { tier: 'founding', price_aud: 99, founding_left: 1 });
  assert.deepStrictEqual(m.currentOffer(10), { tier: 'standard', price_aud: 149, founding_left: 0 });
  assert.deepStrictEqual(m.currentOffer(12), { tier: 'standard', price_aud: 149, founding_left: 0 });
});

test('invites: round trip, bound to the email, tamper and expiry refused', () => {
  const s = 'k';
  const t = m.signInvite('Roger@Example.com', NOW + 86400, s);
  assert.deepStrictEqual(m.verifyInvite(t, s, NOW), { email: 'roger@example.com' });
  assert.deepStrictEqual(m.verifyInvite(t, 'other', NOW), { error: 'invalid_invite' });
  assert.deepStrictEqual(m.verifyInvite(t, s, NOW + 2 * 86400), { error: 'invite_expired' });
  const [payload, sig] = t.split('.');
  const forged = Buffer.from(`someone@else.com|${NOW + 86400}`).toString('base64url');
  assert.deepStrictEqual(m.verifyInvite(`${forged}.${sig}`, s, NOW), { error: 'invalid_invite' });
  assert.deepStrictEqual(m.verifyInvite(`${payload}.x`, s, NOW), { error: 'invalid_invite' });
  assert.deepStrictEqual(m.verifyInvite(t, '', NOW), { error: 'invites_off' });
  // An expiry further out than the policy allows is refused even if signed.
  const far = m.signInvite('a@b.co', NOW + 400 * 86400, s);
  assert.deepStrictEqual(m.verifyInvite(far, s, NOW), { error: 'invalid_invite' });
});

test('session params: DIY pays today; an invited setup buyer gets 30 days, no card, cancel if none added', () => {
  const base = { priceId: 'price_f99', tier: 'founding', email: 'a@b.co', baseUrl: 'https://crads-ai.com', termsVersion: '0.13' };
  const diy = m.sessionParams({ ...base, included: false });
  assert.strictEqual(diy.mode, 'subscription');
  assert.strictEqual(diy.subscription_data.trial_period_days, undefined);
  assert.strictEqual(diy.payment_method_collection, undefined);
  assert.strictEqual(diy.metadata.kind, 'membership');
  assert.strictEqual(diy.subscription_data.metadata.tier, 'founding');
  const inc = m.sessionParams({ ...base, included: true });
  assert.strictEqual(inc.subscription_data.trial_period_days, 30);
  assert.strictEqual(inc.payment_method_collection, 'if_required');
  assert.deepStrictEqual(inc.subscription_data.trial_settings, { end_behavior: { missing_payment_method: 'cancel' } });
  assert.strictEqual(inc.metadata.included, 'yes');
});

// --- the handler, with a fake Stripe -------------------------------------
function fakeStripe({ foundingSubs = [], memberEmails = [] } = {}) {
  const created = [];
  return {
    created,
    subscriptions: {
      list: async (q) => {
        if (q.price) return { data: foundingSubs, has_more: false };
        if (q.customer === 'cus_member') return { data: [{ status: 'active', items: { data: [{ price: { id: 'price_f99' } }] } }] };
        return { data: [], has_more: false };
      },
    },
    customers: { list: async ({ email }) => ({ data: memberEmails.includes(email) ? [{ id: 'cus_member' }] : [] }) },
    checkout: { sessions: { create: async (p) => { created.push(p); return { url: 'https://checkout.stripe.test/x' }; } } },
  };
}
function res() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = () => r;
  return r;
}
const post = (body) => ({ method: 'POST', body, headers: {} });

test('GET reports the founding places left', async () => {
  handler._stripe = fakeStripe({ foundingSubs: [{ status: 'active' }, { status: 'trialing', trial_end: NOW }] });
  const r = res();
  await handler({ method: 'GET', headers: {} }, r);
  assert.deepStrictEqual(r.body, { tier: 'founding', price_aud: 99, founding_left: 8, founding_cap: 10 });
});

test('POST: DIY on the founding price while places last, then A$149', async () => {
  let s = fakeStripe();
  handler._stripe = s;
  let r = res();
  await handler(post({ email: 'Owner@Biz.com', agreed_terms: true }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(s.created[0].line_items[0].price, 'price_f99');
  assert.strictEqual(s.created[0].customer_email, 'owner@biz.com');
  s = fakeStripe({ foundingSubs: Array.from({ length: 10 }, () => ({ status: 'active' })) });
  handler._stripe = s;
  r = res();
  await handler(post({ email: 'late@biz.com', agreed_terms: true }), r);
  assert.strictEqual(s.created[0].line_items[0].price, 'price_s149');
});

test('POST: terms must be ticked; a member cannot join twice', async () => {
  handler._stripe = fakeStripe({ memberEmails: ['in@biz.com'] });
  let r = res();
  await handler(post({ email: 'x@biz.com', agreed_terms: 'true' }), r);
  assert.strictEqual(r.body.error, 'terms_not_accepted');
  r = res();
  await handler(post({ email: 'in@biz.com', agreed_terms: true }), r);
  assert.strictEqual(r.statusCode, 409);
  assert.strictEqual(r.body.error, 'already_member');
});

test('POST: an invite sets the included month and its own email wins over the form', async () => {
  const s = fakeStripe();
  handler._stripe = s;
  const invite = m.signInvite('roger@example.com', Math.floor(Date.now() / 1000) + 86400, process.env.MEMBERSHIP_INVITE_SECRET);
  const r = res();
  await handler(post({ email: 'someone@else.com', invite, agreed_terms: true }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(s.created[0].customer_email, 'roger@example.com');
  assert.strictEqual(s.created[0].subscription_data.trial_period_days, 30);
  const bad = res();
  await handler(post({ email: 'a@b.co', invite: 'nope.nope', agreed_terms: true }), bad);
  assert.strictEqual(bad.body.error, 'invalid_invite');
});
