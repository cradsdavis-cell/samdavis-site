// api/checkout.js — POST creates Stripe Checkout (paid) OR direct Cal booking (Discovery)
'use strict';

const { getSku, isPurchasable, DISCOVERY_EVENT_TYPE_ID } = require('../lib/skus');
const { createCheckoutSession, findPromotionCode } = require('../lib/stripe');
const { createBooking, findBookingByStripeSession } = require('../lib/cal');
const { TERMS_VERSION } = require('../lib/terms');
const { refFromCookie, buyerDiscountFor, referralCouponId, PAYING_SKUS } = require('../lib/referrals');
const { cleanUtmSource } = require('../lib/attribution');
const { cleanTimeZone } = require('../lib/timeZone');

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;
const CODE_RE = /^[A-Za-z0-9-]{1,40}$/;
const MAX_BOOKING_WINDOW_MS = 60 * 86400000; // 60 days

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || 'https://crads-ai.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sanitize(name) {
  return String(name)
    .replace(/[\x00-\x1f\x7f]/g, '')          // ASCII control chars
    .replace(/https?:\/\/\S+/gi, '')         // strip URLs (defence vs phishing in race-loss email body)
    .replace(/\s+/g, ' ')                       // collapse whitespace
    .trim()
    .slice(0, NAME_MAX);
}

// The partner remembered against this email by an earlier roadmap booking
// (kv ref_attr, which expires with the 90 days), as { slug }, or null. Best
// effort: a KV failure means no discount, never a failed checkout.
async function refFromEmail(email) {
  try {
    const { defaultKv } = require('../lib/kv');
    const attr = await defaultKv().getRefAttribution(email);
    return attr && attr.slug ? { slug: attr.slug, at: attr.at || null } : null;
  } catch (err) {
    console.error('[checkout] referral lookup failed', err && err.message);
    return null;
  }
}

// Best effort: an alert that fails never fails a checkout.
async function alertSam(subject, body) {
  try {
    const { sendSamAlert } = require('../lib/email');
    await sendSamAlert({ subject, body });
  } catch (err) {
    console.error('[checkout] Sam alert failed', err && err.message);
  }
}

function validateBody({ sku, slot_iso, email, name }) {
  if (!sku || typeof sku !== 'string') return 'missing_sku';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) return 'invalid_email';
  if (!name || typeof name !== 'string') return 'missing_name';
  // Every paid SKU books its first Cal slot at checkout (v4: the retainer, the
  // one SKU that did not, is retired).
  if (!slot_iso || !ISO_RE.test(slot_iso)) return 'invalid_slot_iso';
  const slotMs = Date.parse(slot_iso);
  if (Number.isNaN(slotMs)) return 'invalid_slot_iso';
  const now = Date.now();
  if (slotMs < now) return 'slot_in_past';
  if (slotMs > now + MAX_BOOKING_WINDOW_MS) return 'slot_too_far_in_future';
  return null;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body;
  if (Buffer.isBuffer(req.body)) {
    try { body = JSON.parse(req.body.toString('utf8')); } catch { res.status(400).json({ error: 'invalid_json' }); return; }
  } else if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body); } catch { res.status(400).json({ error: 'invalid_json' }); return; }
  } else {
    body = req.body || {};
  }

  const sku = String(body.sku || '');
  const slot_iso = String(body.slot_iso || '');
  const email = String(body.email || '').trim().toLowerCase();
  const name = sanitize(body.name || '');
  // The utm_source tag on the booking page link, if any (lib/attribution.js).
  const utmSource = cleanUtmSource(body.utm_source);
  // The booker's browser time zone (Sydney if missing or unknown).
  const timeZone = cleanTimeZone(body.time_zone);

  const validationError = validateBody({ sku, slot_iso, email, name });
  if (validationError) { res.status(400).json({ error: validationError }); return; }

  // S3: derive isFree purely from sku — no ?free=1 query gate
  const isFree = sku === 'discovery';

  if (isFree) {
    // S1/S2: minimal abuse defence — dedupe by email+slot (rejects naïve scripted spam
    // that POSTs identical bookings; doesn't defend against distributed attack).
    // Honest: this is a band-aid, not a complete defence. Production-grade rate
    // limiting (Upstash KV + Edge Middleware, or Cloudflare Turnstile) is a future TODO.
    try {
      const synthSessionId = `free_discovery_${email}_${slot_iso}`;
      const existing = await findBookingByStripeSession(synthSessionId);
      if (existing.ok && existing.body?.data?.length > 0) {
        res.status(409).json({ error: 'duplicate_booking', message: 'You already have a booking for this slot.' });
        return;
      }
      const booking = await createBooking({
        eventTypeId: DISCOVERY_EVENT_TYPE_ID(),
        slotIso: slot_iso,
        name,
        email,
        stripeSessionId: synthSessionId,
        sku: 'discovery',
        timeZone,
        ...(utmSource ? { utmSource } : {}),
      });
      if (!booking.ok) {
        // Don't leak Cal's error body to the public caller (M2)
        if (booking.status === 409) {
          res.status(409).json({ error: 'slot_unavailable', message: 'That slot just got taken — pick another.' });
        } else {
          console.error('[checkout] discovery createBooking failed', booking.status, booking.body);
          res.status(502).json({ error: 'booking_failed' });
        }
        return;
      }
      // The opt-in tick box on the discovery form (unticked by default).
      // Strictly boolean true. Best effort: a list failure never fails a
      // booking that Cal has already made.
      if (body.newsletter === true) {
        try {
          const { addSubscriber } = require('../lib/newsletter');
          const { defaultKv } = require('../lib/kv');
          await addSubscriber(defaultKv(), email, { source: '/book/discovery', consent: 'express-booking' });
        } catch (err) {
          console.error('[checkout] newsletter opt-in failed', err && err.message);
        }
      }
      res.status(200).json({ free: true, booked: true });
    } catch (err) {
      console.error('[checkout] discovery error', err);
      res.status(500).json({ error: 'internal_error' });
    }
    return;
  }

  // Paid path. Retired slugs (coaching-block, single-session, the retainer)
  // are unknown here on purpose: a client mid-engagement books through
  // /account/book, never through a fresh checkout.
  if (!isPurchasable(sku)) { res.status(400).json({ error: 'unknown_sku' }); return; }
  // The tick box on the booking form. Enforced here too, because the form is
  // not the only thing that can POST to this endpoint. Strictly boolean true:
  // a string "false" must not count as agreement.
  if (body.agreed_terms !== true) { res.status(400).json({ error: 'terms_not_accepted' }); return; }
  let cfg;
  try { cfg = getSku(sku); }
  catch (err) {
    console.error('[checkout] SKU misconfigured', sku, err && err.message);
    res.status(500).json({ error: 'sku_misconfigured' });
    return;
  }

  // Optional discount code from the booking form. Unknown, used-up, expired
  // or wrong-product codes all answer the same way: invalid_code.
  const code = String(body.code || '').trim();
  let promotionCodeId = null;
  if (code) {
    if (!CODE_RE.test(code)) { res.status(400).json({ error: 'invalid_code' }); return; }
    try { promotionCodeId = await findPromotionCode(code); }
    catch (err) { console.error('[checkout] promotion code lookup failed', err && err.message); res.status(500).json({ error: 'stripe_failed' }); return; }
    if (!promotionCodeId) { res.status(400).json({ error: 'invalid_code' }); return; }
  }

  // A partner's referral cookie (/r/<slug>, 90 days, first touch). Rides on
  // the session metadata; the webhook decides what it is worth.
  const ref = refFromCookie(req.headers && req.headers.cookie);
  // The buyer's side of a referral (2026-10-21): A$100 off a guided setup.
  // Stripe takes one discount per session, so a code typed on the form
  // takes its place rather than stacking (the booking page says so).
  // Without the cookie, a referral carried from an earlier roadmap booking by
  // the same email (ref_attr, the one that already pays the partner) counts.
  let refDiscount = null;
  if (!promotionCodeId) {
    refDiscount = buyerDiscountFor(ref, sku);
    if (!refDiscount && !ref && PAYING_SKUS.has(sku) && referralCouponId()) refDiscount = buyerDiscountFor(await refFromEmail(email), sku);
  }

  const args = {
    sku, priceId: cfg.stripe_price_id, priceAud: cfg.price_aud, productName: cfg.label,
    slotIso: slot_iso, name, email,
    calEventTypeId: cfg.cal_event_type_id, baseUrl: process.env.BASE_URL,
    termsVersion: TERMS_VERSION, termsAcceptedAt: new Date().toISOString(),
    promotionCodeId,
    couponId: refDiscount ? refDiscount.coupon : null,
    refDiscountAud: refDiscount ? refDiscount.aud : null,
    ref: ref ? ref.slug : null, refAt: ref ? ref.at : null,
    utmSource, timeZone,
  };
  try {
    let session;
    try {
      session = await createCheckoutSession(args);
    } catch (err) {
      // A referral coupon Stripe refuses (deleted, expired, wrong product)
      // must not cost the sale: book at full price and tell Sam, who owes
      // the buyer A$100 back.
      if (!refDiscount || !err || err.type !== 'StripeInvalidRequestError') throw err;
      console.error('[checkout] referral coupon refused', refDiscount.coupon, err.message);
      await alertSam(
        `referral coupon REFUSED for ${email}`,
        `Stripe refused the referral coupon "${refDiscount.coupon}" (STRIPE_REFERRAL_COUPON) for a ${sku} checkout by ${email} (${name}), referred by ${refDiscount.slug}: ${err.message}. The checkout went ahead at full price. If they pay, refund A$${refDiscount.aud} by hand, then fix the coupon or the env var.`,
      );
      session = await createCheckoutSession({ ...args, couponId: null, refDiscountAud: null });
    }
    res.status(200).json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    // A code that exists but does not apply (another product, run out) is
    // refused by Stripe at session creation.
    if (promotionCodeId && err && err.type === 'StripeInvalidRequestError') {
      res.status(400).json({ error: 'invalid_code' });
      return;
    }
    console.error('[checkout] Stripe error', err);
    res.status(500).json({ error: 'stripe_failed' });
  }
};
