'use strict';
// lib/pricing.js — the INDICATIVE rate card the billing page shows (Sam,
// 2026-08-23: "fill in some pricing now, just for the numbers").
//
// These are Sam's own 11 Aug rates (PRICE_DEFAULTS in the topology sandbox,
// carried into notes/research/crads-ai-market-analysis-2026-08.md). They are
// DISPLAY ONLY: Stripe stays at $0 by the 17 Aug beta ruling until the 26 Sep
// read-date, and the page says so. When a price is armed on Stripe, the live
// amounts replace these and `charging` flips; nothing else on the page moves.
//
// Cents, AUD. Tier bands mirror cockpit/config/crads-bands.json (seats = every
// member tie; the count picks the tier, it is never charged). The 11 Aug card
// had a fourth tier at $2,499; Stripe carries three keys, so tier 3 is the
// open-ended top here until a fourth key exists.

const INDICATIVE = {
  currency: 'aud',
  charging: false,                // nothing is collected while this is false
  hosting: 4900,                  // per box a rock runs (crads-rock-hosted-seat)
  direct: 19900,                  // a pebble hosted directly (crads-hosted-pebble-direct)
  tiers: {
    'crads-rock-tier-1': { seats: 50, fee: 14900 },
    'crads-rock-tier-2': { seats: 150, fee: 44900 },
    'crads-rock-tier-3': { seats: 400, fee: 119900 },
  },
};

// What billingView wants: { tier(seats)->fee, hosting, direct } + bands.
function priceTable(card = INDICATIVE) {
  const bands = Object.fromEntries(Object.entries(card.tiers).map(([k, t]) => [k, { seats: t.seats }]));
  const tierFee = (key) => (card.tiers[key] && card.tiers[key].fee) || 0;
  return { hosting: card.hosting, direct: card.direct, tierFee, bands, charging: !!card.charging, currency: card.currency };
}

module.exports = { INDICATIVE, priceTable };
