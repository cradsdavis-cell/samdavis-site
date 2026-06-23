// lib/sessionBalance.js — per-client session balance.
//
// The system records what a client *bought* (engagements[]) but historically had no
// notion of how many sessions of a block they'd *used* or had *left*. Without that, the
// portal can't tell a paid-up block client from a stranger, so the only booking route was
// the public pay-walled checkout (→ "will this charge me again?"). This module is that
// missing primitive: it derives a client's bookable balance from their engagements.
'use strict';

// Sessions included per SKU. null = not a fixed-count block (recurring / ad-hoc).
const SESSIONS_PER_SKU = {
  'coaching-block': 4,
  'coaching-block-pay4': 4,
  'single-session': 1,
  'group-block': 4,
  'group-block-pay4': 4,
  'continuation-retainer': null,
};

// SKUs whose remaining sessions a client may self-book from the portal (the 1:1 ladder).
// Group blocks are cohort-scheduled (pre-blocked in GCal); single-session books its one
// slot at checkout; retainer is recurring and handled via the retainer-active state.
const PORTAL_BOOKABLE_BLOCK_SKUS = new Set(['coaching-block', 'coaching-block-pay4']);

function sessionsForSku(sku) {
  return Object.prototype.hasOwnProperty.call(SESSIONS_PER_SKU, sku) ? SESSIONS_PER_SKU[sku] : null;
}

// How many sessions are already consumed at the moment of purchase. A block and a
// single-session book their first session during checkout (Stripe webhook → Cal), so
// 1 is already used. Cohort/retainer book nothing at checkout.
function initialSessionsUsed(sku) {
  if (sku === 'coaching-block' || sku === 'coaching-block-pay4' || sku === 'single-session') return 1;
  return 0;
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
// blocks. `activeBlock` is the engagement a portal booking should draw down.
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
    activeBlock, // engagement to decrement on a block booking; null for retainer
  };
}

module.exports = {
  SESSIONS_PER_SKU, PORTAL_BOOKABLE_BLOCK_SKUS,
  sessionsForSku, initialSessionsUsed, engagementBalance, computeBalance,
};
