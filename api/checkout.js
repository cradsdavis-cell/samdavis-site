// api/checkout.js — POST creates Stripe Checkout (paid) OR direct Cal booking (Discovery)
'use strict';

const { getSku, DISCOVERY_EVENT_TYPE_ID } = require('../lib/skus');
const { createCheckoutSession } = require('../lib/stripe');
const { createBooking, findBookingByStripeSession } = require('../lib/cal');

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;
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

function validateBody({ sku, slot_iso, email, name }) {
  if (!sku || typeof sku !== 'string') return 'missing_sku';
  if (!slot_iso || !ISO_RE.test(slot_iso)) return 'invalid_slot_iso';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) return 'invalid_email';
  if (!name || typeof name !== 'string') return 'missing_name';
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
      res.status(200).json({ free: true, booked: true });
    } catch (err) {
      console.error('[checkout] discovery error', err);
      res.status(500).json({ error: 'internal_error' });
    }
    return;
  }

  // Paid path
  let cfg;
  try { cfg = getSku(sku); }
  catch { res.status(400).json({ error: 'unknown_sku' }); return; }

  try {
    const session = await createCheckoutSession({
      sku, priceId: cfg.stripe_price_id, slotIso: slot_iso, name, email,
      calEventTypeId: cfg.cal_event_type_id, baseUrl: process.env.BASE_URL,
    });
    res.status(200).json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[checkout] Stripe error', err);
    res.status(500).json({ error: 'stripe_failed' });
  }
};
