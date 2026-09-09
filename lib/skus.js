// lib/skus.js - single source of truth for SKU -> Stripe price + Cal event type.
//
// v4 (2026-09-09, "the product is free, my time costs money"): two purchasable
// SKUs. Guided setup is TWO 1-hour sessions at least a day apart (session 1 is
// booked at Stripe checkout, session 2 from /account/book against the session
// balance, see lib/sessionBalance.js and api/account/book.js). Working session
// is one 90-minute slot booked at checkout. Everything ongoing (Continuation
// Retainer, the four-session Coaching Block, pay-in-4, Group Block) is retired.
//
// Price IDs are not secrets (every checkout page exposes them), so the live
// IDs live here and STRIPE_PRICE_* env vars merely override them. The same
// goes for Cal event type IDs (plain integers; created through Cal's v2 API
// on 2026-09-09 with a key that worked once the version header was sent):
// the v4 types are hard-coded here and CAL_EVENT_TYPE_* env vars override.
// The env names are NEW on purpose: CAL_EVENT_TYPE_SINGLE in Vercel points
// at the retired 60-minute "Single Coaching Session" type, which the working
// session had been booking (an hour held for a 90-minute session); it stays
// for legacy portal bookings only. Legacy types have no default: they exist
// only in env, and a missing one fails loudly.
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

// env wins when set; otherwise the hard-coded default; a SKU with neither throws.
function calEventTypeIdOf(def) {
  if (process.env[def.cal_event_env]) return requireIntEnv(def.cal_event_env);
  if (Number.isInteger(def.cal_event_default)) return def.cal_event_default;
  return requireIntEnv(def.cal_event_env);
}

// Purchasable. Slug must equal the /book/<slug> page name: lib/stripe.js
// builds the cancel_url from it and lib/email.js links /book/<sku>.
const SKU_DEFS = {
  'guided-setup': {
    stripe_price_env: 'STRIPE_PRICE_GUIDED_SETUP',
    price_id_default: 'price_1UDZF62MeTK4rlQYWqYrGVnJ',
    cal_event_env: 'CAL_EVENT_TYPE_GUIDED_SETUP',
    cal_event_default: 6999123,   // "Guided setup session", 60 min, hidden, coaching schedule
    label: 'Guided setup (session 1 of 2)',
    duration_min: 60,
    price_aud: 700,
    sessions: 2,
  },
  'working-session': {
    stripe_price_env: 'STRIPE_PRICE_WORKING_SESSION',
    price_id_default: 'price_1UDZF62MeTK4rlQYjBzaNU1l',
    cal_event_env: 'CAL_EVENT_TYPE_WORKING_SESSION',
    cal_event_default: 6999124,   // "Working session", 90 min, hidden, coaching schedule
    label: 'Working session',
    duration_min: 90,
    price_aud: 350,
    sessions: 1,
  },
};

// Retired 2026-09-09, never purchasable again. Kept only so a client who is
// mid-engagement on one of these can still book their remaining sessions from
// /account/book (which needs the Cal event type) and so /api/cal/availability
// can serve that picker. No price: api/checkout.js refuses these slugs.
const LEGACY_SKU_DEFS = {
  'coaching-block': { cal_event_env: 'CAL_EVENT_TYPE_BLOCK', label: 'Coaching Block (retired)', duration_min: 90, sessions: 4 },
  'coaching-block-pay4': { cal_event_env: 'CAL_EVENT_TYPE_BLOCK', label: 'Coaching Block, instalments (retired)', duration_min: 90, sessions: 4 },
  'single-session': { cal_event_env: 'CAL_EVENT_TYPE_SINGLE', label: 'Single Coaching Session (retired)', duration_min: 90, sessions: 1 },
  'continuation-retainer': { cal_event_env: 'CAL_EVENT_TYPE_RETAINER', label: 'Continuation Retainer (retired)', duration_min: 90, sessions: null },
};

function isPurchasable(slug) {
  return Object.prototype.hasOwnProperty.call(SKU_DEFS, slug);
}

// Purchasable SKUs only: price + Cal type. Throws on unknown or retired slugs.
function getSku(slug) {
  const def = SKU_DEFS[slug];
  if (!def) throw new Error(`Unknown SKU: ${slug}`);
  return {
    stripe_price_id: process.env[def.stripe_price_env] || def.price_id_default,
    cal_event_type_id: calEventTypeIdOf(def),
    label: def.label,
    duration_min: def.duration_min,
    price_aud: def.price_aud,
    sessions: def.sessions,
  };
}

// Purchasable OR legacy: the Cal event type a booking for this slug uses.
// Used by the account portal and the availability proxy, never by checkout.
function calEventTypeIdFor(slug) {
  const def = SKU_DEFS[slug] || LEGACY_SKU_DEFS[slug];
  if (!def) throw new Error(`Unknown SKU: ${slug}`);
  return calEventTypeIdOf(def);
}

const DISCOVERY_EVENT_TYPE_ID = () => requireIntEnv('CAL_EVENT_TYPE_DISCOVERY');

const SKU_SLUGS = Object.keys(SKU_DEFS);
const SKUS = SKU_DEFS;

module.exports = { SKUS, SKU_SLUGS, LEGACY_SKU_DEFS, isPurchasable, getSku, calEventTypeIdFor, DISCOVERY_EVENT_TYPE_ID };
