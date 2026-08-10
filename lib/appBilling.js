'use strict';
// lib/appBilling.js — the account's billing view core (arc A4, ruling 10).
//
// Two truths kept apart:
//   PERSONAL billing exists and works — the Stripe billing portal, reusing the
//     exact pattern api/account/subscription.js already uses, plus the
//     engagements already on the user record.
//   ROCK billing (a rock you own, billed per seat to this account) is RULED
//     but not built: the worker's only ledger is GET /events behind the
//     operator token, with no per-owner view, and pricing is unarmed. So it is
//     STATED here, never faked with numbers that do not exist. Ruling 10 asked
//     for it on the account page; honesty asks it not lie until the worker can
//     answer.
//
// Factored as a pure builder taking a stripe client so a test can drive it
// without a live key (the site's DI-factory convention).

async function billingView({ user, stripe, baseUrl }) {
  const out = { engagements: user.engagements || [], portalUrl: null, portalError: null, linked: !!user.stripe_customer_id };
  if (user.stripe_customer_id && stripe) {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${baseUrl || 'https://crads-ai.com'}/app/billing`,
      });
      out.portalUrl = session.url;
    } catch (e) {
      out.portalError = String(e && e.message || e);
    }
  }
  return out;
}

module.exports = { billingView };
