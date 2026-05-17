'use strict';

const { getSku, DISCOVERY_EVENT_TYPE_ID } = require('../lib/skus');
const { createCheckoutSession } = require('../lib/stripe');
const { createBooking } = require('../lib/cal');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { sku, slot_iso, email, name } = body;
  if (!sku || !slot_iso || !email || !name) {
    res.status(400).json({ error: 'missing_fields', required: ['sku', 'slot_iso', 'email', 'name'] });
    return;
  }

  // Free Discovery path
  const isFree = (req.query && req.query.free === '1') || sku === 'discovery';
  if (isFree) {
    if (sku !== 'discovery') { res.status(400).json({ error: 'free_only_for_discovery' }); return; }
    const booking = await createBooking({
      eventTypeId: DISCOVERY_EVENT_TYPE_ID(),
      slotIso: slot_iso,
      name,
      email,
      stripeSessionId: `free_discovery_${Date.now()}`,
      sku: 'discovery',
    });
    if (!booking.ok) { res.status(502).json({ error: 'cal_booking_failed', status: booking.status, body: booking.body }); return; }
    res.status(200).json({ free: true, booked: true });
    return;
  }

  // Paid path
  let cfg;
  try { cfg = getSku(sku); } catch { res.status(400).json({ error: 'unknown_sku' }); return; }

  try {
    const session = await createCheckoutSession({
      sku, priceId: cfg.stripe_price_id, slotIso: slot_iso, name, email,
      calEventTypeId: cfg.cal_event_type_id, baseUrl: process.env.BASE_URL,
    });
    res.status(200).json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    res.status(500).json({ error: 'stripe_failed', message: err.message });
  }
};
