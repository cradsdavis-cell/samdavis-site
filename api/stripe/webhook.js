// api/stripe/webhook.js — Stripe webhook → Cal booking
// Idempotency strategy:
//   1. Authoritative: cal_booking_id stashed on PaymentIntent metadata after success
//   2. Backstop: lib/cal.findBookingByStripeSession (client-side metadata filter on last 100)
'use strict';

const { constructWebhookEvent, refundSession, retrievePaymentIntent, updatePaymentIntentMetadata } = require('../../lib/stripe');
const { findBookingByStripeSession, createBooking } = require('../../lib/cal');
const { sendRaceLossEmail, sendSamAlert } = require('../../lib/email');

// Disable Vercel body parsing — Stripe needs raw bytes for signature verification
module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function safeAlert(subject, body) {
  try { await sendSamAlert({ subject, body }); } catch (_) { /* swallow; never let alert failure mask the real error */ }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  // Verify signature
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    const rawBody = await readRawBody(req);
    event = constructWebhookEvent(rawBody, sig);
  } catch (err) {
    // Don't echo SDK error message back to caller (LOW-2)
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  if (event.type !== 'checkout.session.completed') {
    res.status(200).json({ received: true, no_op: true });
    return;
  }

  const session = event.data.object;
  const { id: stripeSessionId, amount_total, payment_intent: paymentIntentId, metadata = {} } = session;
  const { sku, slot_iso, name, cal_event_type_id } = metadata;

  // C3: customer_email can be null on Stripe Checkout (Link autofill, existing customer).
  // Prefer customer_details.email (Stripe collects this during Checkout itself).
  const customerEmail = session.customer_details?.email || session.customer_email;

  // H4: required metadata defensive — bad metadata won't succeed on Stripe retries either,
  // so acknowledge (200) to stop retry storm + alert Sam for manual recovery.
  const eventTypeIdInt = parseInt(cal_event_type_id, 10);
  if (!sku || !slot_iso || !name || !customerEmail || Number.isNaN(eventTypeIdInt)) {
    await safeAlert(
      `webhook payload missing required fields for ${stripeSessionId}`,
      `One or more required fields missing/invalid: sku=${sku} slot_iso=${slot_iso} name=${name} email=${customerEmail} eventTypeId=${cal_event_type_id}. Manual recovery required.`,
    );
    res.status(200).json({ received: true, error: 'invalid_metadata' });
    return;
  }

  // C1/C2: Idempotency check via PaymentIntent metadata first (O(1), unbounded retention)
  if (paymentIntentId) {
    try {
      const pi = await retrievePaymentIntent(paymentIntentId);
      if (pi.metadata?.cal_booking_id) {
        res.status(200).json({ received: true, duplicate: true, source: 'pi_metadata' });
        return;
      }
    } catch (_) { /* fall through to backstop scan */ }
  }

  // Backstop idempotency check (Cal-side scan of recent bookings)
  try {
    const existing = await findBookingByStripeSession(stripeSessionId);
    if (existing.ok && existing.body?.data?.length > 0) {
      // Try to backfill PI metadata so future retries hit O(1) path
      if (paymentIntentId) {
        const bookingId = existing.body.data[0].id || existing.body.data[0].uid;
        try { await updatePaymentIntentMetadata(paymentIntentId, { cal_booking_id: String(bookingId) }); } catch (_) {}
      }
      res.status(200).json({ received: true, duplicate: true, source: 'cal_scan' });
      return;
    }
  } catch (_) { /* fall through to create booking */ }

  // Create the booking
  const booking = await createBooking({
    eventTypeId: eventTypeIdInt,
    slotIso: slot_iso,
    name,
    email: customerEmail,
    stripeSessionId,
    sku,
  });

  if (booking.ok) {
    // Stash cal_booking_id on PI for future O(1) idempotency
    const bookingId = booking.body?.data?.id || booking.body?.data?.uid;
    if (paymentIntentId && bookingId) {
      try { await updatePaymentIntentMetadata(paymentIntentId, { cal_booking_id: String(bookingId) }); } catch (_) {}
    }
    res.status(200).json({ received: true, booked: true });
    return;
  }

  // Race-loss: Cal says slot unavailable
  if (booking.status === 409 || (booking.body && booking.body.error === 'slot_unavailable')) {
    // C4/M6: refund FAILURES must trigger Stripe retry so we don't strand the customer.
    // Email failures are best-effort — log + alert Sam, but don't 500 on email-only failure
    // (refund landed, customer's money is safe, email is recoverable manually).
    let refunded = false;
    let refundError = null;
    try {
      await refundSession(stripeSessionId);
      refunded = true;
    } catch (err) {
      refundError = err.message;
      await safeAlert(
        `URGENT: race-loss refund FAILED for ${customerEmail} session ${stripeSessionId}`,
        `Refund failed: ${err.message}. Customer paid but slot taken AND refund failed. Manual Stripe refund required IMMEDIATELY. Will 500 so Stripe retries the webhook.`,
      );
      // Return 500 → Stripe retries → next attempt may succeed
      res.status(500).json({ error: 'refund_failed' });
      return;
    }
    // Refund succeeded → attempt customer email + Sam alert (best-effort)
    try {
      await sendRaceLossEmail({
        to: customerEmail,
        name,
        sku,
        refundAmount: (amount_total / 100).toFixed(2),
      });
    } catch (err) {
      await safeAlert(
        `race-loss customer email FAILED for ${customerEmail}`,
        `Refund succeeded for ${stripeSessionId} but customer email failed: ${err.message}. Customer doesn't know about the refund. Please reach out manually.`,
      );
      // Don't 500 — refund succeeded; Stripe shouldn't retry the refund path
    }
    await safeAlert(
      `race-loss + refund issued for ${sku}`,
      `Customer ${customerEmail} (${name}) lost race on slot ${slot_iso}. Refund issued for $${(amount_total / 100).toFixed(2)}. Stripe session: ${stripeSessionId}`,
    );
    res.status(200).json({ received: true, race_loss: true, refunded });
    return;
  }

  // Cal returned some other error → return 500 so Stripe retries
  await safeAlert(
    `webhook 500 — Cal upstream error for ${stripeSessionId}`,
    `Cal returned ${booking.status}: ${JSON.stringify(booking.body).slice(0, 500)}. Stripe will retry.`,
  );
  res.status(500).json({ error: 'cal_upstream' });
};
