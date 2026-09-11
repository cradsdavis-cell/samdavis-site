// lib/sessionBalance.js - per-client session balance.
//
// The system records what a client *bought* (engagements[]) but historically had no
// notion of how many sessions of a block they'd *used* or had *left*. Without that, the
// portal can't tell a paid-up client from a stranger, so the only booking route was
// the public pay-walled checkout ("will this charge me again?"). This module is that
// missing primitive: it derives a client's bookable balance from their engagements.
//
// v5 (2026-09-11): walkthrough and guided-setup are the live two-session
// engagements (session 1 at checkout, session 2 from the portal, at least a day
// later). working-session (v4, one slot at checkout) and the coaching-block
// entries stay so records written before each pivot keep computing;
// continuation-retainer stays as a STATE (retainer-active) for the same reason.
// Nothing here can sell any of the retired ones again. The counts here must
// agree with lib/skus.js (tests/sessionBalance.test.js pins it).
'use strict';

// Sessions included per SKU. null = not a fixed-count engagement (recurring / ad-hoc).
const SESSIONS_PER_SKU = {
  'walkthrough': 2,
  'guided-setup': 2,
  'working-session': 1,
  'coaching-block': 4,
  'coaching-block-pay4': 4,
  'single-session': 1,
  'continuation-retainer': null,
};

// SKUs whose remaining sessions a client may self-book from the portal. A
// one-session SKU books its only slot at checkout; the retainer is recurring and
// handled via the retainer-active state.
const PORTAL_BOOKABLE_BLOCK_SKUS = new Set(['walkthrough', 'guided-setup', 'coaching-block', 'coaching-block-pay4']);

// Engagements whose session 2 must sit at least this long after session 1 (the
// onboarding interview, the homework, lives in that gap).
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS_BY_SKU = { 'walkthrough': DAY_MS, 'guided-setup': DAY_MS };

function sessionsForSku(sku) {
  return Object.prototype.hasOwnProperty.call(SESSIONS_PER_SKU, sku) ? SESSIONS_PER_SKU[sku] : null;
}

// How many sessions are already consumed at the moment of purchase. Every
// fixed-count SKU books its first session during checkout (Stripe webhook -> Cal),
// so 1 is already used. The retainer booked nothing at checkout.
function initialSessionsUsed(sku) {
  const total = sessionsForSku(sku);
  return typeof total === 'number' && total >= 1 ? 1 : 0;
}

function minGapMsFor(sku) {
  return MIN_GAP_MS_BY_SKU[sku] || 0;
}

// Normalise one engagement's balance fields, tolerating legacy records written before the
// counter existed. A completed block counts as fully used; an active block without a
// counter assumes only the checkout-booked first session is consumed.
function engagementBalance(e) {
  const total = typeof e.sessions_total === 'number' ? e.sessions_total : sessionsForSku(e.type);
  let used = typeof e.sessions_used === 'number' ? e.sessions_used : null;
  if (used === null) {
    used = e.completed ? (typeof total === 'number' ? total : 0) : initialSessionsUsed(e.type);
  }
  if (used < 0) used = 0;
  if (typeof total === 'number' && used > total) used = total;
  const remaining = typeof total === 'number' ? Math.max(0, total - used) : null;
  return { total, used, remaining };
}

// Aggregate the client's bookable balance across active (non-completed) portal-bookable
// engagements. `activeBlock` is the engagement a portal booking should draw down.
function computeBalance(user) {
  const engagements = (user && user.engagements) || [];
  let total = 0, used = 0, remaining = 0, activeBlock = null;
  for (const e of engagements) {
    if (!PORTAL_BOOKABLE_BLOCK_SKUS.has(e.type)) continue;
    const b = engagementBalance(e);
    if (typeof b.total !== 'number') continue;
    total += b.total;
    used += b.used;
    remaining += b.remaining;
    if (!e.completed && b.remaining > 0 && !activeBlock) activeBlock = e;
  }
  const isRetainer = !!(user && user.state === 'retainer-active');
  return {
    total, used, remaining,
    hasBlock: total > 0,
    isRetainer,
    bookable: remaining > 0 || isRetainer,
    activeBlock, // engagement to decrement on a portal booking; null for retainer
  };
}

module.exports = {
  SESSIONS_PER_SKU, PORTAL_BOOKABLE_BLOCK_SKUS, MIN_GAP_MS_BY_SKU,
  sessionsForSku, initialSessionsUsed, minGapMsFor, engagementBalance, computeBalance,
};
