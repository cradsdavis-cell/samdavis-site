// lib/skus.js - single source of truth for SKU -> Stripe price + Cal event types.
//
// v5 (2026-09-11, "offer v5"): two purchasable SKUs, BOTH two sessions at least
// a day apart. Session 1 is booked at Stripe checkout; session 2 from
// /account/book against the session balance (lib/sessionBalance.js,
// api/account/book.js). The sessions of one SKU have DIFFERENT lengths, so a
// SKU carries one Cal event type PER SESSION:
//
//   walkthrough   A$350   S1 60 min (Claude Code + the app)   S2 30 min (brain review, CRIT, Q&A)
//   guided-setup  A$700   S1 60 min (same, plus hosted or local)   S2 120 min (connections, first skills, schedules)
//
// The v4 "Working session" (90 min, A$350) is retired as a product: extra time
// after the 30 support days is A$233 an hour on request, not a SKU. Its Stripe
// price is REUSED as the walkthrough price (same amount; the Stripe product is
// still named "Working session" on Stripe's side, see the README). Its Cal type
// (6999124) survives only as a legacy env-only entry, like the coaching ladder.
//
// Price IDs are not secrets (every checkout page exposes them), so the live
// IDs live here and STRIPE_PRICE_* env vars merely override them. The same
// goes for Cal event type IDs (plain integers). The four v5 types were created
// through Cal's v2 API on 2026-09-11 (header cal-api-version: 2024-06-14),
// hidden, on the coaching schedule, Google Meet, like the v4 pair before them.
// Env names are per session so a stale Vercel value cannot shadow the wrong
// one. Legacy types have no default: they exist only in env, and a missing one
// fails loudly.
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

// env wins when set; otherwise the hard-coded default; a session with neither throws.
function calEventTypeIdOf(sessionDef) {
  if (process.env[sessionDef.cal_event_env]) return requireIntEnv(sessionDef.cal_event_env);
  if (Number.isInteger(sessionDef.cal_event_default)) return sessionDef.cal_event_default;
  return requireIntEnv(sessionDef.cal_event_env);
}

// Purchasable. Slug must equal the /book/<slug> page name: lib/stripe.js
// builds the cancel_url from it and lib/email.js links /book/<sku>.
// `sessions` is ordered: index 0 is booked at checkout, the rest from the portal.
const SKU_DEFS = {
  'walkthrough': {
    stripe_price_env: 'STRIPE_PRICE_WALKTHROUGH',
    price_id_default: 'price_1UDZF62MeTK4rlQYjBzaNU1l',   // A$350; the v4 working-session price, reused
    label: 'Walkthrough',
    price_aud: 350,
    sessions: [
      { label: 'Walkthrough, session 1', duration_min: 60, cal_event_env: 'CAL_EVENT_TYPE_WALKTHROUGH_S1', cal_event_default: 7030765 },
      { label: 'Walkthrough, session 2', duration_min: 30, cal_event_env: 'CAL_EVENT_TYPE_WALKTHROUGH_S2', cal_event_default: 7030766 },
    ],
  },
  'guided-setup': {
    stripe_price_env: 'STRIPE_PRICE_GUIDED_SETUP',
    price_id_default: 'price_1UDZF62MeTK4rlQYWqYrGVnJ',   // A$700, unchanged from v4
    label: 'Guided setup',
    price_aud: 700,
    sessions: [
      { label: 'Guided setup, session 1', duration_min: 60, cal_event_env: 'CAL_EVENT_TYPE_GUIDED_SETUP_S1', cal_event_default: 7030767 },
      { label: 'Guided setup, session 2', duration_min: 120, cal_event_env: 'CAL_EVENT_TYPE_GUIDED_SETUP_S2', cal_event_default: 7030768 },
    ],
  },
};

// Retired, never purchasable again. Kept only so a client who is mid-engagement
// on one of these can still book their remaining sessions from /account/book
// (which needs the Cal event type) and so /api/cal/availability can serve that
// picker. One event type for every session. No price: api/checkout.js refuses
// these slugs. `session_count` null = not a fixed-count engagement.
const LEGACY_SKU_DEFS = {
  'working-session': { cal_event_env: 'CAL_EVENT_TYPE_WORKING_SESSION', label: 'Working session (retired)', duration_min: 90, session_count: 1 },
  'coaching-block': { cal_event_env: 'CAL_EVENT_TYPE_BLOCK', label: 'Coaching Block (retired)', duration_min: 90, session_count: 4 },
  'coaching-block-pay4': { cal_event_env: 'CAL_EVENT_TYPE_BLOCK', label: 'Coaching Block, instalments (retired)', duration_min: 90, session_count: 4 },
  'single-session': { cal_event_env: 'CAL_EVENT_TYPE_SINGLE', label: 'Single Coaching Session (retired)', duration_min: 90, session_count: 1 },
  'continuation-retainer': { cal_event_env: 'CAL_EVENT_TYPE_RETAINER', label: 'Continuation Retainer (retired)', duration_min: 90, session_count: null },
};

function isPurchasable(slug) {
  return Object.prototype.hasOwnProperty.call(SKU_DEFS, slug);
}

function anyDef(slug) {
  const def = SKU_DEFS[slug] || LEGACY_SKU_DEFS[slug];
  if (!def) throw new Error(`Unknown SKU: ${slug}`);
  return def;
}

// The definition of session N (1-based) of a SKU. A purchasable SKU has one
// per session and refuses a number past its last; a legacy SKU uses the same
// type for every session.
function sessionDefFor(slug, session = 1) {
  const def = anyDef(slug);
  const n = Number.isInteger(session) ? session : parseInt(session, 10);
  if (!(n >= 1)) throw new Error(`Invalid session number for ${slug}: ${session}`);
  if (Array.isArray(def.sessions)) {
    if (n > def.sessions.length) throw new Error(`SKU ${slug} has ${def.sessions.length} sessions, not ${n}`);
    return def.sessions[n - 1];
  }
  return { label: def.label, duration_min: def.duration_min, cal_event_env: def.cal_event_env };
}

// Sessions included. null = not a fixed-count engagement (the legacy retainer).
function sessionCountFor(slug) {
  const def = anyDef(slug);
  return Array.isArray(def.sessions) ? def.sessions.length : def.session_count;
}

// Purchasable SKUs only: price + every session's Cal type. Throws on unknown
// or retired slugs. `cal_event_type_id` / `duration_min` are session 1's, the
// slot checkout books.
function getSku(slug) {
  const def = SKU_DEFS[slug];
  if (!def) throw new Error(`Unknown SKU: ${slug}`);
  const sessions = def.sessions.map((s) => ({ label: s.label, duration_min: s.duration_min, cal_event_type_id: calEventTypeIdOf(s) }));
  return {
    stripe_price_id: process.env[def.stripe_price_env] || def.price_id_default,
    cal_event_type_id: sessions[0].cal_event_type_id,
    duration_min: sessions[0].duration_min,
    label: def.label,
    price_aud: def.price_aud,
    session_count: sessions.length,
    sessions,
  };
}

// Purchasable OR legacy: the Cal event type session N of this slug books.
// Used by the account portal and the availability proxy, never by checkout.
function calEventTypeIdFor(slug, session = 1) {
  return calEventTypeIdOf(sessionDefFor(slug, session));
}

// Human label for a session, for emails and the portal ("Walkthrough, session 1").
function sessionLabelFor(slug, session = 1) {
  return sessionDefFor(slug, session).label;
}

function skuLabel(slug) {
  return anyDef(slug).label;
}

const DISCOVERY_EVENT_TYPE_ID = () => requireIntEnv('CAL_EVENT_TYPE_DISCOVERY');

const SKU_SLUGS = Object.keys(SKU_DEFS);
const SKUS = SKU_DEFS;

module.exports = {
  SKUS, SKU_SLUGS, LEGACY_SKU_DEFS, isPurchasable, getSku, calEventTypeIdFor,
  sessionDefFor, sessionCountFor, sessionLabelFor, skuLabel, DISCOVERY_EVENT_TYPE_ID,
};
