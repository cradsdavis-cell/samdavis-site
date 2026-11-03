// api/code.js: GET /api/code?sku=<slug>&code=<code>, asked by the booking page
// (2026-11-04) when it opens from a ?code= link, so the price pill can say
// "A$250, free with your code" instead of a bare list price the visitor was
// told they would not pay. Every miss (bad format, unknown SKU, a code that
// does not apply, Stripe down) answers { quote: null } and the page keeps the
// list price; checkout re-checks the code either way.
'use strict';

const { quotePromotionCode } = require('../lib/stripe');
const { getSku, isPurchasable } = require('../lib/skus');

const CODE_RE = /^[A-Za-z0-9-]{1,40}$/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const sku = String((req.query && req.query.sku) || '');
  const code = String((req.query && req.query.code) || '').trim();
  if (!isPurchasable(sku) || !CODE_RE.test(code)) { res.status(200).json({ quote: null }); return; }
  let offAud = null;
  let priceAud = null;
  try {
    const def = getSku(sku);
    priceAud = def.price_aud;
    offAud = await quotePromotionCode(code, { priceId: def.stripe_price_id, productId: def.stripe_product_id, priceAud });
  } catch (err) {
    console.error('[code] quote failed', err && err.message);
  }
  if (!(Number.isInteger(offAud) && offAud > 0 && Number.isInteger(priceAud))) { res.status(200).json({ quote: null }); return; }
  res.status(200).json({ quote: { price_aud: priceAud, off_aud: offAud, pay_aud: priceAud - offAud } });
};
