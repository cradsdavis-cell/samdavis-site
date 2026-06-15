// lib/skus.js — single source of truth for SKU → Stripe price + Cal event type
// v2 (2026-06-02 coaching co-primary spec § 4.1): EA Basic Build RETIRED.
// Group Block + Continuation Retainer added. Pay-in-4 surcharge SKUs use
// dedicated price env vars (see _PAY4 suffix); upfront vs pay-in-4 routing
// is handled at the booking-flow layer (offer toggle appends ?plan=pay4).
'use strict';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function requireIntEnv(name) {
  const v = requireEnv(name);
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} is not a valid integer: "${v}"`);
  return n;
}

const SKU_DEFS = {
  'single-session': { stripe_price_env: 'STRIPE_PRICE_SINGLE_V2', cal_event_env: 'CAL_EVENT_TYPE_SINGLE', label: 'Single Coaching Session', duration_min: 60, price_aud: 300 },
  'coaching-block': { stripe_price_env: 'STRIPE_PRICE_BLOCK_V2_FULL', cal_event_env: 'CAL_EVENT_TYPE_BLOCK', label: 'Coaching Block — Session 1', duration_min: 60, price_aud: 1000 },
  'coaching-block-pay4': { stripe_price_env: 'STRIPE_PRICE_BLOCK_V2_PAY4_FIRST', cal_event_env: 'CAL_EVENT_TYPE_BLOCK', label: 'Coaching Block — Session 1 (4 instalments)', duration_min: 60, price_aud: 1100 },
  'group-block': { stripe_price_env: 'STRIPE_PRICE_GROUP', cal_event_env: 'CAL_EVENT_TYPE_GROUP', label: 'Group Block — Cohort Seat', duration_min: 90, price_aud: 600 },
  'group-block-pay4': { stripe_price_env: 'STRIPE_PRICE_GROUP_PAY4', cal_event_env: 'CAL_EVENT_TYPE_GROUP', label: 'Group Block — Cohort Seat (4 instalments)', duration_min: 90, price_aud: 660 },
  'continuation-retainer': { stripe_price_env: 'STRIPE_PRICE_RETAINER', cal_event_env: 'CAL_EVENT_TYPE_RETAINER', label: 'Continuation Retainer (monthly)', duration_min: 60, price_aud: 750 },
};

function getSku(slug) {
  const def = SKU_DEFS[slug];
  if (!def) throw new Error(`Unknown SKU: ${slug}`);
  return {
    stripe_price_id: requireEnv(def.stripe_price_env),
    cal_event_type_id: requireIntEnv(def.cal_event_env),
    label: def.label,
    duration_min: def.duration_min,
    price_aud: def.price_aud,
  };
}

const DISCOVERY_EVENT_TYPE_ID = () => requireIntEnv('CAL_EVENT_TYPE_DISCOVERY');

const SKU_SLUGS = Object.keys(SKU_DEFS);
const SKUS = SKU_DEFS;

module.exports = { SKUS, SKU_SLUGS, getSku, DISCOVERY_EVENT_TYPE_ID };
