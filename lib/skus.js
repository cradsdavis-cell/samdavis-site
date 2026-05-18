// lib/skus.js — single source of truth for SKU → Stripe price + Cal event type
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
  'single-session': { stripe_price_env: 'STRIPE_PRICE_SINGLE', cal_event_env: 'CAL_EVENT_TYPE_SINGLE', label: 'Single Coaching Session', duration_min: 60, price_aud: 150 },
  'coaching-block': { stripe_price_env: 'STRIPE_PRICE_BLOCK', cal_event_env: 'CAL_EVENT_TYPE_BLOCK', label: 'Coaching Block — Session 1', duration_min: 60, price_aud: 500 },
  'ea-basic-build': { stripe_price_env: 'STRIPE_PRICE_BUILD', cal_event_env: 'CAL_EVENT_TYPE_BUILD', label: 'EA Basic Build — Kickoff', duration_min: 120, price_aud: 2000 },
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
