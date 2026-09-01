'use strict';
// lib/cradsPortal.js — the Stripe customer portal for CRADS-AI billing.
//
// /account/subscription has carried a portal link for coaching since long
// before this, and the billing design doc says /app/billing "already carries
// the Stripe portal link". It does not, and never did: that link is on the
// COACHING surface against user.stripe_customer_id, a different customer from
// the crads_ai one. So a Crads-AI customer has had no way to see an invoice or
// change a card. Found 2026-08-25 auditing what stands between here and a
// self-service subscription product.
//
// Crads-AI customers are keyed by email PLUS metadata crads_ai=true (see
// cockpit/tools/crads-billing.mjs ensureCustomer), which is why this cannot
// reuse user.stripe_customer_id: the same person can hold a coaching customer
// and a platform customer, and billing them from the wrong one would be worse
// than showing nothing.
//
// FAIL SOFT, ALWAYS. This page's job is to tell someone what they owe. A Stripe
// outage must cost them the portal button, never the page.

// Portal configuration created 2026-08-25. Chooses what a customer may do:
// update their card, read their invoices, correct their email. Cancellation and
// self-serve plan switching are deliberately OFF; see the note in /app/billing.
// Non-secret, account-scoped, and stable, so it is written here rather than
// added to the deploy environment.
const PORTAL_CONFIGURATION = process.env.STRIPE_PORTAL_CONFIGURATION || 'bpc_1U8TD52MeTK4rlQYumWD4vMM';

async function cradsPortalUrl({ stripe, email, returnUrl }) {
  const em = String(email || '').trim().toLowerCase();
  if (!stripe || !em) return { url: null, why: 'no account' };
  try {
    // Same query shape ensureCustomer uses, so the two agree about who this is.
    const found = await stripe.customers.search({
      query: `email:'${em.replace(/'/g, "\\'")}' AND metadata['crads_ai']:'true'`,
      limit: 1,
    });
    const customer = (found.data || [])[0];
    if (!customer) return { url: null, why: 'no platform customer yet' };
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl,
      ...(PORTAL_CONFIGURATION ? { configuration: PORTAL_CONFIGURATION } : {}),
    });
    return { url: session.url, why: '' };
  } catch (e) {
    return { url: null, why: String((e && e.message) || e).slice(0, 120) };
  }
}

module.exports = { cradsPortalUrl, PORTAL_CONFIGURATION };
