'use strict';
// lib/pricing.js — the INDICATIVE rate card the billing page shows (Sam,
// 2026-08-23: "fill in some pricing now, just for the numbers").
//
// PRICING V3, ruled in the 2026-08-23 grill (supersedes the 11 Aug card:
// direct $199 -> $79, the rock's own box moves inside the tier, seven tiers
// fine at the bottom). They are DISPLAY ONLY: Stripe stays at $0 by the 17 Aug beta ruling until the 26 Sep
// read-date, and the page says so. When a price is armed on Stripe, the live
// amounts replace these and `charging` flips; nothing else on the page moves.
//
// Cents, AUD. Tier bands mirror cockpit/config/crads-bands.json (seats = every
// member tie; the count picks the tier, it is never charged). A joined member
// is a direct pebble paying its own hosting; the rock pays hosting only for
// ANCHORED members, and nothing for its own box.

const INDICATIVE = {
  currency: 'aud',
  charging: false,                // nothing is collected while this is false
  hosting: 4900,                  // per ANCHORED member box a rock runs (crads-rock-hosted-seat); floor $35 held in reserve
  direct: 7900,                   // a pebble hosted directly, incl. every JOINED member (crads-hosted-pebble-direct)
  // PRICING V3 (grill, 2026-08-23): seven tiers, fine where rocks actually are
  // (2-3 pebbles), ~1.8x per step. Seats = every member tie, joined or
  // anchored; the rock's OWN box is inside the tier fee (+$49 on every rung).
  tiers: {
    // v3.1 (same hour): the rock's own box is FOLDED INTO EVERY TIER FEE
    // (+$49 on each rung), so hosting stays anchored-only and the own box is
    // paid for without a separate line.
    'crads-rock-tier-1': { seats: 3, fee: 8900 },   // $89, not $79: the smallest rock sits a little above a solo pebble (Sam, 2026-08-23)
    'crads-rock-tier-2': { seats: 6, fee: 9900 },
    'crads-rock-tier-3': { seats: 12, fee: 13900 },
    'crads-rock-tier-4': { seats: 25, fee: 20900 },
    'crads-rock-tier-5': { seats: 50, fee: 32900 },
    'crads-rock-tier-6': { seats: 100, fee: 54900 },
    'crads-rock-tier-7': { seats: Infinity, fee: 94900 },
  },
};

// What billingView wants: { tier(seats)->fee, hosting, direct } + bands.
function priceTable(card = INDICATIVE) {
  const bands = Object.fromEntries(Object.entries(card.tiers).map(([k, t]) => [k, { seats: Number.isFinite(t.seats) ? t.seats : undefined }]));
  const tierFee = (key) => (card.tiers[key] && card.tiers[key].fee) || 0;
  return { hosting: card.hosting, direct: card.direct, tierFee, bands, charging: !!card.charging, currency: card.currency };
}

module.exports = { INDICATIVE, priceTable };
