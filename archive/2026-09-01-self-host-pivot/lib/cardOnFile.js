'use strict';
// lib/cardOnFile.js — does this account have a card Stripe can actually charge?
//
// Sam, 2026-08-26: `billing_enabled` stops being a radio the user flips and
// becomes a FACT read from Stripe. Under arrears that matters more than it
// sounds: a month of service is delivered before a cent is collected, so a real
// card before anything accrues is the only thing standing between the platform
// and a month given away.
//
// The customer is found the way the platform finds it everywhere: email plus
// metadata crads_ai, never user.stripe_customer_id, which is the COACHING
// customer and a different person as far as Stripe is concerned.
//
// FAILS SOFT, AND FAILS CLOSED. If Stripe cannot be read we report no card, and
// the caller treats that as "cannot create a mineral" rather than "go ahead".
// The alternative is a Stripe outage silently opening the gate for everyone.

const CACHE_MS = 5 * 60 * 1000;

async function hasSavedCard({ stripe, email }) {
  const em = String(email || '').trim().toLowerCase();
  if (!stripe || !em) return { ok: false, card: null, why: 'no account' };
  try {
    const listed = await stripe.customers.list({ email: em, limit: 100 });
    const all = (listed.data || []).filter((c) => c && !c.deleted);
    const mine = all.filter((c) => (c.metadata || {}).crads_ai === 'true');
    const customer = (mine.length ? mine : all).sort((a, b) => a.created - b.created)[0];
    if (!customer) return { ok: true, card: null, why: 'no platform customer yet' };
    const pms = await stripe.paymentMethods.list({ customer: customer.id, type: 'card', limit: 1 });
    const pm = (pms.data || [])[0];
    if (!pm) return { ok: true, card: null, customerId: customer.id, why: 'no card on file' };
    return {
      ok: true, customerId: customer.id,
      card: { brand: pm.card && pm.card.brand, last4: pm.card && pm.card.last4, exp_month: pm.card && pm.card.exp_month, exp_year: pm.card && pm.card.exp_year },
    };
  } catch (e) {
    return { ok: false, card: null, why: String((e && e.message) || e).slice(0, 120) };
  }
}

/**
 * Read the fact, and remember it on the user record so a token mint does not
 * have to call Stripe on every page render. Short cache: a card added on the
 * billing page must show up on the next one, not in an hour.
 */
async function refreshCardOnFile({ stripe, kv, user }) {
  const fresh = await hasSavedCard({ stripe, email: user.email });
  if (!fresh.ok) return { ...user, _cardCheckFailed: fresh.why };   // leave the last known value alone
  const rec = { ...user, has_card: !!fresh.card, card_brand: fresh.card ? fresh.card.brand : null, card_last4: fresh.card ? fresh.card.last4 : null, card_checked_at: Date.now() };
  if (rec.has_card !== user.has_card || !user.card_checked_at) {
    try { await kv.setUser(user.email, rec); } catch { /* the render still gets the fresh value */ }
  }
  return rec;
}

const cardIsStale = (user) => !user.card_checked_at || (Date.now() - user.card_checked_at) > CACHE_MS;

module.exports = { hasSavedCard, refreshCardOnFile, cardIsStale, CACHE_MS };
