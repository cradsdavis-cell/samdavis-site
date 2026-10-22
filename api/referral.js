// api/referral.js: GET /api/referral?sku=<slug>, asked by the booking page
// (2026-10-21). The crads_ref cookie is HttpOnly, so the page cannot read it
// itself: this says whether the visitor's referral takes money off this SKU,
// and whose first name to thank. Never names a partner without a live cookie.
'use strict';

const { refFromCookie, buyerDiscountFor } = require('../lib/referrals');
const { getSku, isPurchasable } = require('../lib/skus');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const sku = String((req.query && req.query.sku) || '');
  const ref = refFromCookie(req.headers && req.headers.cookie);
  const d = isPurchasable(sku) ? buyerDiscountFor(ref, sku) : null;
  if (!d) { res.status(200).json({ discount: null }); return; }
  let priceAud = null;
  try { priceAud = getSku(sku).price_aud; } catch { /* the page shows the A$ off alone */ }
  res.status(200).json({ discount: { aud: d.aud, name: d.name, price_aud: priceAud } });
};
