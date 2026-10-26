// lib/membership.js: the Crads membership (spec 2026-10-22).
//
// A$99 a month, cancel any time. The first 10 members are "founding" and keep
// A$99 for as long as they stay; everyone after pays A$149. For setup buyers
// (walkthrough, guided setup) the 30 days of Slack support ARE month 1 (Sam,
// 26 Oct): they arrive through a signed invite link from Sam, which names the
// day their support ends, and their first charge lands that day (the billing
// cycle is anchored to it, nothing prorated; the card is taken at signup).
// Everyone else (DIY) pays from day 1.
//
// Pure functions only. api/membership.js does the Stripe calls.
'use strict';

const crypto = require('crypto');

// Live price ids. The env vars override (test mode, or a re-price).
const FOUNDING_PRICE_DEFAULT = '';   // set when Sam creates the A$99 price (drafts/membership-2026-10/1-stripe.md)
const STANDARD_PRICE_DEFAULT = '';   // the A$149 price
const FOUNDING_CAP = 10;
const FOUNDING_AUD = 99;
const STANDARD_AUD = 149;
const INVITE_MAX_DAYS = 45;          // how long an invite link stays good
const MIN_DELAY_SECONDS = 3600;      // an anchor this close (or past) just bills today

function prices() {
  return {
    founding: process.env.STRIPE_PRICE_MEMBERSHIP_FOUNDING || FOUNDING_PRICE_DEFAULT,
    standard: process.env.STRIPE_PRICE_MEMBERSHIP_STANDARD || STANDARD_PRICE_DEFAULT,
  };
}

// A founding place is held by a subscription on the founding price that is
// live (active, trialing, past_due, unpaid), or that ended after its first charge,
// so it was billed at least once. A setup buyer who cancels before their first
// charge gives the place back.
// Cancelled paying members keep their place counted: the 10 close for real.
const LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid']);
// The first charge: a trial's end, else the billing anchor (a setup buyer's
// support end; for DIY, the moment they joined).
function holdsFoundingPlace(sub) {
  if (LIVE.has(sub.status)) return true;
  if (sub.status !== 'canceled') return false;
  const first = sub.trial_end || sub.billing_cycle_anchor;
  if (!first) return true;
  return Boolean(sub.ended_at) && sub.ended_at > first + 3600;
}

function foundingTaken(subs) {
  return subs.filter(holdsFoundingPlace).length;
}

// Which price a new member gets right now.
function currentOffer(taken, cap = FOUNDING_CAP) {
  const left = Math.max(0, cap - taken);
  return left > 0
    ? { tier: 'founding', price_aud: FOUNDING_AUD, founding_left: left }
    : { tier: 'standard', price_aud: STANDARD_AUD, founding_left: 0 };
}

// --- Invite links for setup buyers (the 30 support days are month 1) -------
// token = base64url(email|expiresUnix|startsUnix).base64url(hmac), where
// startsUnix is the end of their support: the day of the first charge. The secret is shared
// with the cockpit (MEMBERSHIP_INVITE_SECRET), which writes the link into the
// roll-in email it stages for Sam. Binding the email stops a forwarded link
// being used by someone else; the site never reveals who is a client.
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function signInvite(email, expiresUnix, startsUnix, secret) {
  if (!secret) throw new Error('no invite secret');
  const payload = b64u(`${String(email).trim().toLowerCase()}|${expiresUnix}|${startsUnix}`);
  const sig = b64u(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

// Returns { email, startsAt } or { error }. nowUnix is injectable for tests.
function verifyInvite(token, secret, nowUnix = Math.floor(Date.now() / 1000)) {
  if (!secret) return { error: 'invites_off' };
  const m = /^([A-Za-z0-9_-]{4,400})\.([A-Za-z0-9_-]{43})$/.exec(String(token || ''));
  if (!m) return { error: 'invalid_invite' };
  const want = crypto.createHmac('sha256', secret).update(m[1]).digest();
  const got = Buffer.from(m[2], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { error: 'invalid_invite' };
  const [email, exp, starts] = Buffer.from(m[1], 'base64url').toString('utf8').split('|');
  const expires = Number(exp);
  const startsAt = Number(starts);
  if (!email || !Number.isInteger(expires) || !Number.isInteger(startsAt)) return { error: 'invalid_invite' };
  if (expires < nowUnix) return { error: 'invite_expired' };
  if (expires > nowUnix + INVITE_MAX_DAYS * 86400) return { error: 'invalid_invite' };
  return { email, startsAt };
}

// The Checkout Session for a new member. startsAt = a verified setup buyer's
// support end (unix): billing starts then. nowUnix is injectable for tests.
function sessionParams({ priceId, tier, email, startsAt, nowUnix = Math.floor(Date.now() / 1000), baseUrl, termsVersion, termsAcceptedAt, ref, refAt, utmSource, referrerField, heardFromField }) {
  const meta = {
    kind: 'membership',
    tier,
    route: startsAt ? 'setup' : 'diy',
    terms_version: termsVersion || '',
    terms_accepted_at: termsAcceptedAt || '',
    ref: ref || '',
    ref_at: refAt || '',
    utm_source: utmSource || '',
  };
  const params = {
    mode: 'subscription',
    payment_method_types: ['card'],   // as the bookings (lib/stripe.js); the account default also offered Klarna
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    allow_promotion_codes: true,
    metadata: meta,
    // On the subscription too, so the cockpit sees the tier and route without
    // looking up the Checkout Session.
    subscription_data: { metadata: meta },
    custom_fields: [referrerField, heardFromField].filter(Boolean),
    success_url: `${baseUrl}/membership/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/membership?cancelled=1`,
  };
  // Their 30 days of support are month 1, so the first charge waits for the
  // day they end: Checkout shows "A$0.00 due today, then A$99 per month
  // starting <date>". No trial, so no 48-hour floor and no "free trial" label.
  if (startsAt && startsAt > nowUnix + MIN_DELAY_SECONDS) {
    params.subscription_data.billing_cycle_anchor = startsAt;
    params.subscription_data.proration_behavior = 'none';
  }
  return params;
}

module.exports = {
  FOUNDING_CAP, FOUNDING_AUD, STANDARD_AUD, INVITE_MAX_DAYS, MIN_DELAY_SECONDS,
  prices, holdsFoundingPlace, foundingTaken, currentOffer,
  signInvite, verifyInvite, sessionParams,
};
