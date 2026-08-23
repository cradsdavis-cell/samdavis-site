'use strict';
// GET /api/pricing — the indicative rate card, public and CORS-open, so the
// box's own Billing card (wizard/panel/member.html) computes the same figures
// the account's billing page shows, from ONE source (lib/pricing.js). Cents,
// AUD. `charging` says whether Stripe actually collects; it is false until a
// price is armed. Cached for an hour at the edge: a rate card changes by
// decision, not by the minute.
const { INDICATIVE } = require('../lib/pricing');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).send('method not allowed');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const tiers = Object.entries(INDICATIVE.tiers).map(([key, t]) => ({ key, seats: Number.isFinite(t.seats) ? t.seats : null, fee: t.fee }));
  return res.status(200).send(JSON.stringify({
    currency: INDICATIVE.currency,
    charging: !!INDICATIVE.charging,
    hosting: INDICATIVE.hosting,
    direct: INDICATIVE.direct,
    tiers,
    note: 'Indicative. Seats = every member tie; the count picks the tier and is never charged. Hosting is per anchored member box; the rock\'s own box is inside the tier fee. A joined member is a direct pebble paying its own hosting.',
  }));
};
