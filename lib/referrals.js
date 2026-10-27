// lib/referrals.js — the partner referral system (2026-10-16, Sam's rulings).
//
// Invited partners only: Sam hands out crads-ai.com/r/<slug>. A$100 per
// Guided Setup, a 90-day first-touch window that carries through the free
// roadmap, paid after the buyer's session 1.
//
// Two-sided since 2026-10-21 (Sam's ruling): the buyer who arrives through
// the link also gets A$100 off their Guided Setup at checkout. The discount
// is a Stripe coupon named by STRIPE_REFERRAL_COUPON; while that is unset the
// scheme stays one-sided and nothing on the site mentions a discount.
//
// The path a referral takes:
//   /r/<slug>         sets the crads_ref cookie (first touch wins; api/r.js)
//   /api/referral     tells the booking page about the buyer's discount
//   /api/checkout     copies the cookie onto the Checkout Session metadata
//                     and applies the buyer's A$100 off a guided setup
//   webhook           roadmap (or any non-paying SKU): remembers the referrer
//                     against the buyer's email for the rest of the 90 days;
//                     guided setup: writes a referral record (pending-s1)
//   cockpit           flips pending-s1 -> owed once session 1 has happened;
//                     Sam marks paid after the monthly bank transfer
//
// This repo is public, so partners are slugs only. Full names and bank
// details live in the cockpit, never here. `name` is the first name the
// booking page thanks ("A$100 off, thanks to Nim"), set only where the slug
// already is that first name; a partner without one gets "referral discount".
'use strict';

const PARTNERS = [
  { slug: 'nim', name: 'Nim', active: true },
  { slug: 'gavin', name: 'Gavin', active: true },
  { slug: 'teala', name: 'Teala', active: true },
  { slug: 'katie', name: 'Katie', active: true },
  { slug: 'alex', name: 'Alex', active: true },
  { slug: 'annik', name: 'Annik', active: true },
  // A surname: no first name to show.
  { slug: 'elderfield', active: true },
  { slug: 'ari', active: true },
  { slug: 'tap4change', active: true },
  { slug: 'roger', active: true },
];

const COOKIE_NAME = 'crads_ref';
const WINDOW_DAYS = 90;
const WINDOW_SECONDS = WINDOW_DAYS * 86400;
const FEE_AUD = 100;
// Only these SKUs pay the referrer. The roadmap pays nothing but carries the
// referral forward; the walkthrough pays nothing (Sam, 16 Oct).
const PAYING_SKUS = new Set(['guided-setup']);
// The buyer's side (2026-10-21): A$100 off the same SKUs that pay the referrer.
const BUYER_DISCOUNT_AUD = 100;
const COUPON_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9-]{1,32}$/;
// A discount code, as the booking form accepts it (api/checkout.js CODE_RE).
const CODE_RE = /^[A-Za-z0-9-]{1,40}$/;
// Where a host's link may land (2026-10-22, host package): /r/<slug>?to=roadmap
// goes to the roadmap booking page, with ?code= filling the discount field.
// Anything else goes home, as before.
const LANDINGS = { roadmap: '/book/roadmap', 'guided-setup': '/book/guided-setup' };

// The Location for /r/<slug>: home, or a known booking page with the code.
function landingFor(to, code) {
  const page = LANDINGS[String(to || '')];
  if (!page) return '/';
  const c = String(code || '').trim();
  return CODE_RE.test(c) ? `${page}?code=${encodeURIComponent(c)}` : page;
}

// A host's capped code names the host (2026-10-22). The map lives in the KV
// (ref_code:<CODE> -> { slug }), written by the cockpit from its private
// partner config, so a donor-only code never appears in this public repo.
function normCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return CODE_RE.test(c) ? c : '';
}
const TEXT_MAX = 100;

function partnerFor(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(s)) return null;
  return PARTNERS.find((p) => p.slug === s && p.active) || null;
}

// The cookie value is "<slug>.<unix seconds of first touch>", so the first
// touch date travels with the referral and the 90 days can be checked here
// too, not only by the browser's Max-Age.
function formatCookieValue(slug, nowMs = Date.now()) {
  return `${slug}.${Math.floor(nowMs / 1000)}`;
}

function parseCookieHeader(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

// { slug, at } for a live referral cookie on this request, else null. A
// retired partner or a touch older than 90 days reads as no referral.
function refFromCookie(header, nowMs = Date.now()) {
  const raw = parseCookieHeader(header)[COOKIE_NAME];
  if (!raw) return null;
  const m = /^([a-z0-9-]{1,32})\.(\d{9,11})$/.exec(raw);
  if (!m || !partnerFor(m[1])) return null;
  const atMs = Number(m[2]) * 1000;
  if (atMs > nowMs + 60000 || nowMs - atMs > WINDOW_SECONDS * 1000) return null;
  return { slug: m[1], at: new Date(atMs).toISOString() };
}

function setCookieHeader(value) {
  return `${COOKIE_NAME}=${value}; Max-Age=${WINDOW_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

// The Stripe coupon for the buyer's A$100 off, or null while the two-sided
// scheme is switched off (STRIPE_REFERRAL_COUPON unset or malformed).
function referralCouponId() {
  const id = String(process.env.STRIPE_REFERRAL_COUPON || '').trim();
  return COUPON_RE.test(id) ? id : null;
}

// What a buyer with this referral gets off this SKU: { coupon, aud, name }
// (name null when the partner has no first name on file; slug for alerts), or null. `ref` is
// what refFromCookie returned, so a stale or retired referral is already null.
function buyerDiscountFor(ref, sku) {
  if (!ref || !PAYING_SKUS.has(sku)) return null;
  const partner = partnerFor(ref.slug);
  const coupon = referralCouponId();
  if (!partner || !coupon) return null;
  return { coupon, aud: BUYER_DISCOUNT_AUD, slug: partner.slug, name: partner.name || null };
}

// The "Who sent you?" answer from Stripe Checkout, trimmed, or ''.
function customFieldText(session) {
  const fields = (session && session.custom_fields) || [];
  const f = fields.find((x) => x && x.key === 'referrer');
  const v = f && f.text && f.text.value;
  return v ? String(v).replace(/\s+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, TEXT_MAX) : '';
}

// A free-text answer that names a partner's slug as a word ("Nim", "nim
// zappert") gets that slug as a SUGGESTION. Sam still confirms it by hand:
// a free-text answer never pays on its own.
function suggestSlug(text) {
  const words = String(text || '').toLowerCase().split(/[^a-z0-9-]+/);
  const hit = PARTNERS.find((p) => p.active && words.includes(p.slug));
  return hit ? hit.slug : null;
}

// First touch wins. Candidates are { slug, at } (either may be null); the
// earliest live one is the referrer.
function firstTouch(...candidates) {
  const live = candidates.filter((c) => c && c.slug && partnerFor(c.slug));
  if (!live.length) return null;
  live.sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0));
  return live[0];
}

// What the webhook should do for one completed checkout. Pure: the caller
// does the KV reads and writes.
//   meta:  { ref, ref_at, ref_discount_aud } from the Checkout Session
//          metadata (the cookie, and what the buyer got off)
//   text:  the "Who sent you?" answer ('' when blank)
//   attr:  the stored attribution for this buyer's email, or null
// Returns { attribution, record } where either may be null.
//   codeRef: { slug } when the discount code used is a host's code, or null.
//            It counts as a touch at purchase time, so an earlier link wins.
function planReferral({ sku, meta = {}, text = '', attr = null, codeRef = null, sessionId, email, name, slotIso, nowIso }) {
  const fromCookie = meta.ref ? { slug: meta.ref, at: meta.ref_at || nowIso, via: 'link' } : null;
  const fromAttr = attr && attr.slug ? { slug: attr.slug, at: attr.at, via: 'earlier-booking' } : null;
  const fromCode = codeRef && codeRef.slug ? { slug: codeRef.slug, at: nowIso, via: 'code' } : null;
  const winner = firstTouch(fromCookie, fromAttr, fromCode);
  const code = normCode(meta.promo_code);
  const anyText = text || (attr && attr.text) || '';

  if (!PAYING_SKUS.has(sku)) {
    // Carry it forward. Only write when there is something new to keep: the
    // store keeps the first one (set-if-absent), so a later link cannot
    // overwrite an earlier one.
    if (winner) return { attribution: { slug: winner.slug, at: winner.at, sku, session: sessionId, ...(code ? { code } : {}) }, record: null };
    if (text) return { attribution: { slug: null, text, at: nowIso, sku, session: sessionId }, record: null };
    return { attribution: null, record: null };
  }

  const base = {
    id: sessionId,
    sku,
    buyer_email: email,
    buyer_name: name || '',
    stripe_session_id: sessionId,
    s1_at: slotIso || null,
    amount_aud: FEE_AUD,
    // What the buyer got off at checkout (0 when a typed code took its place
    // or the scheme was one-sided). Recorded only; it never changes the fee.
    buyer_discount_aud: Number(meta.ref_discount_aud) || 0,
    referrer_text: anyText,
    created_at: nowIso,
    updated_at: nowIso,
  };
  if (winner) {
    return { attribution: null, record: { ...base, referrer: winner.slug, first_touch_at: winner.at, via: winner.via, status: 'pending-s1' } };
  }
  if (anyText) {
    return { attribution: null, record: { ...base, referrer: null, suggested: suggestSlug(anyText), first_touch_at: null, via: 'who-sent-you', status: 'needs-review' } };
  }
  return { attribution: null, record: null };
}

module.exports = {
  PARTNERS, COOKIE_NAME, WINDOW_DAYS, WINDOW_SECONDS, FEE_AUD, PAYING_SKUS, BUYER_DISCOUNT_AUD,
  partnerFor, referralCouponId, buyerDiscountFor, formatCookieValue, parseCookieHeader, refFromCookie, setCookieHeader,
  landingFor, normCode,
  customFieldText, suggestSlug, firstTouch, planReferral,
};
