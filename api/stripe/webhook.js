// api/stripe/webhook.js — Stripe webhook → Cal booking (with race-loss + idempotency)
'use strict';

const { constructWebhookEvent, refundSession } = require('../../lib/stripe');
const { findBookingByStripeSession, createBooking } = require('../../lib/cal');
const { sendRaceLossEmail, sendSamAlert } = require('../../lib/email');

// Disable Vercel body parsing — we need the raw buffer for Stripe signature
module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (req.rawBody) return req.rawBody;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = constructWebhookEvent(rawBody, sig);
  } catch (err) {
    res.status(400).json({ error: 'invalid_signature', message: err.message });
    return;
  }

  if (event.type !== 'checkout.session.completed') {
    res.status(200).json({ received: true, no_op: true });
    return;
  }

  const session = event.data.object;
  const { id: stripeSessionId, customer_email, amount_total, metadata = {} } = session;
  const { sku, slot_iso, name, cal_event_type_id } = metadata;

  // Idempotency: skip if Cal already has booking for this session
  const existing = await findBookingByStripeSession(stripeSessionId);
  if (existing.ok && existing.body && existing.body.data && existing.body.data.length > 0) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  // Book the slot
  const booking = await createBooking({
    eventTypeId: parseInt(cal_event_type_id, 10),
    slotIso: slot_iso,
    name,
    email: customer_email,
    stripeSessionId,
    sku,
  });

  if (booking.ok) {
    res.status(200).json({ received: true, booked: true });
    return;
  }

  // Race-loss: Cal says slot unavailable
  if (booking.status === 409 || (booking.body && booking.body.error === 'slot_unavailable')) {
    try {
      await refundSession(stripeSessionId);
      await sendRaceLossEmail({
        to: customer_email,
        name,
        sku,
        refundAmount: (amount_total / 100).toFixed(2),
      });
      await sendSamAlert({
        subject: `race-loss + refund issued for ${sku}`,
        body: `Customer ${customer_email} (${name}) lost race on slot ${slot_iso}. Refund issued for $${(amount_total / 100).toFixed(2)}. Stripe session: ${stripeSessionId}`,
      });
    } catch (err) {
      // refund failed — alert Sam manually
      await sendSamAlert({
        subject: `URGENT: race-loss refund FAILED for ${customer_email}`,
        body: `Stripe session ${stripeSessionId} hit race-loss but refund or email failed: ${err.message}. Manual recovery required.`,
      });
    }
    res.status(200).json({ received: true, race_loss: true, refunded: true });
    return;
  }

  // Cal is down or returned some other error → return 500 so Stripe retries
  await sendSamAlert({
    subject: `webhook 500 — Cal upstream error for ${stripeSessionId}`,
    body: `Cal returned ${booking.status}: ${JSON.stringify(booking.body)}. Stripe will retry.`,
  });
  res.status(500).json({ error: 'cal_upstream', cal_status: booking.status });
};
