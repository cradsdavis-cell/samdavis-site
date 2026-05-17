// api/checkout.js — creates a Stripe Checkout session for paid SKUs
'use strict';

const { getSku } = require('../lib/skus');
const { createCheckoutSession } = require('../lib/stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { sku, slot_iso, email, name } = body;
  if (!sku || !slot_iso || !email || !name) {
    res.status(400).json({ error: 'missing_fields', required: ['sku', 'slot_iso', 'email', 'name'] });
    return;
  }
  let cfg;
  try { cfg = getSku(sku); } catch { res.status(400).json({ error: 'unknown_sku' }); return; }

  try {
    const session = await createCheckoutSession({
      sku,
      priceId: cfg.stripe_price_id,
      slotIso: slot_iso,
      name,
      email,
      calEventTypeId: cfg.cal_event_type_id,
      baseUrl: process.env.BASE_URL,
    });
    res.status(200).json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    res.status(500).json({ error: 'stripe_failed', message: err.message });
  }
};
