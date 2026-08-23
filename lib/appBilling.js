'use strict';
// lib/appBilling.js — the account's billing view, money v2 (ruled 2026-08-23,
// ai-os docs/superpowers/specs/2026-08-23-billing-placeholder.md).
//
// Two things live here, both PURE so a test drives them without a key:
//
//   billingView()  — what the page shows: the switch, the held minerals as
//                    invoice lines, and two figures COMPUTED ON READ (never
//                    stored): "so far this period" (pro-rated by days) and
//                    "per month at current seats". Prices default to $0 (the
//                    17 Aug beta ruling); when pricing arms the caller passes
//                    the live amounts and nothing else here changes.
//   tiesFor()      — a rock's live ties from this account's event slice:
//                    seats = every tie (joined + anchored), hosting = own box
//                    + anchored. Seats are never money; they pick the tier.
//
// The money model, stated once: a ROCK is two lines, tier + hosting. A DIRECT
// pebble is one line, hosting. An ANCHORED pebble is a hosting unit on its
// rock's bill and has no line of its own.

const DAY = 86400000;
const ZERO = { tier: 0, hosting: 0, direct: 0 };

function normRel(rel) {
  if (rel === 'community') return 'joined';
  if (rel === 'anchor' || !rel) return 'anchored';
  return rel;
}

// Live ties per org from an event slice (same key discipline as the worker's
// billing-replay: org|e|role|slug). Returns Map(org -> { seats, anchored }).
function tiesFor(events = []) {
  const live = new Map();
  for (const ev of [...events].sort((a, b) => (a.at || 0) - (b.at || 0))) {
    if (!ev || !ev.org) continue;
    const k = `${ev.org}|${ev.e || ''}|${ev.role || ''}|${String(ev.slug || '')}`;
    const legacy = ev.slug ? `${ev.org}|${ev.e || ''}|${ev.role || ''}|` : null;
    if (ev.type === 'member-join') {
      if (legacy && live.has(legacy)) live.delete(legacy);
      live.set(k, { org: ev.org, rel: normRel(ev.rel), status: ev.status || 'active' });
    } else if (ev.type === 'member-change') {
      const cur = live.get(k) || (legacy && live.get(legacy));
      if (!cur) continue;
      if (legacy) live.delete(legacy);
      live.set(k, { ...cur, rel: ev.to && ev.to.rel ? normRel(ev.to.rel) : cur.rel, status: (ev.to && ev.to.status) || cur.status });
    } else if (ev.type === 'member-left') {
      if (!live.delete(k) && legacy) live.delete(legacy);
    }
  }
  const out = new Map();
  for (const t of live.values()) {
    if (t.status !== 'active') continue;
    const o = out.get(t.org) || { seats: 0, anchored: 0 };
    o.seats += 1;
    if (t.rel === 'anchored') o.anchored += 1;
    out.set(t.org, o);
  }
  return out;
}

// When a mineral's box was built, from the event slice; null if the slice
// does not say (then the whole period is assumed, which never under-bills).
function builtAt(events, host) {
  const slug = String(host || '').split('.')[0];
  let at = null;
  for (const ev of events) {
    if (ev && ev.type === 'box-built' && ev.slug === slug && (at === null || ev.at < at)) at = ev.at;
  }
  return at;
}

function tierKeyFor(seats, bands = {}) {
  // the lowest tier whose band holds the seat count; the last tier if none does
  const tiers = Object.keys(bands).sort();
  for (const t of tiers) if (seats <= (bands[t].seats ?? Infinity)) return t;
  return tiers[tiers.length - 1] || 'crads-rock-tier-1';
}

function billingView({ user = {}, minerals = [], events = [], prices = ZERO, bands = {}, now = Date.now(), baseUrl = 'https://crads-ai.com' } = {}) {
  const enabled = !!user.billing_enabled;
  const d = new Date(now);
  const periodStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const periodEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const daysInPeriod = Math.round((periodEnd - periodStart) / DAY);
  const ties = tiesFor(events);

  const lines = [];
  for (const m of minerals) {
    if (m.held_by !== 'you') continue;
    const since = Math.max(periodStart, builtAt(events, m.host) || periodStart);
    const daysSoFar = Math.max(0, Math.min(daysInPeriod, Math.ceil((now - since) / DAY)));
    if (m.tier === 'rock') {
      const t = ties.get(m.org) || { seats: 0, anchored: 0 };
      const hosting = 1 + t.anchored;
      const tierKey = tierKeyFor(t.seats, bands);
      const tierFee = prices.tier || 0;
      const hostingUnit = prices.hosting || 0;
      const monthly = tierFee + hostingUnit * hosting;
      lines.push({
        kind: 'rock', label: m.label || m.host, org: m.org || '', tier: tierKey,
        seats: t.seats, hosting,
        // the breakdown: each component with its unit and quantity, so the page
        // can show HOW the number was reached, not only the number
        parts: [
          { label: `Tier ${tierKey.replace('crads-rock-tier-', '')} (${t.seats} member${t.seats === 1 ? '' : 's'})`, unit: tierFee, qty: 1, amount: tierFee },
          { label: `Hosting, ${hosting} box${hosting === 1 ? '' : 'es'}`, unit: hostingUnit, qty: hosting, amount: hostingUnit * hosting },
        ],
        monthly, so_far: Math.round(monthly * daysSoFar / daysInPeriod), days_so_far: daysSoFar,
      });
    } else if (!m.anchor) {
      const monthly = prices.direct || 0;
      lines.push({
        kind: 'pebble-direct', label: m.label || m.host, hosting: 1,
        parts: [{ label: 'Hosting, 1 box', unit: monthly, qty: 1, amount: monthly }],
        monthly, so_far: Math.round(monthly * daysSoFar / daysInPeriod), days_so_far: daysSoFar,
      });
    } else {
      // a hosting unit on someone else's bill: shown so the account knows
      // where its pebble is billed, never a figure of its own
      lines.push({ kind: 'pebble-anchored', label: m.label || m.host, anchor: m.anchor,
        // what the ROCK pays for this box: shown so the member knows what their
        // host carries for them, never added to this account's total
        parts: [{ label: 'Hosting, 1 box, paid by the rock', unit: prices.hosting || 0, qty: 1, amount: 0, carried: prices.hosting || 0 }],
        monthly: 0, so_far: 0, days_so_far: daysSoFar });
    }
  }
  const monthly = lines.reduce((s, l) => s + l.monthly, 0);
  const soFar = lines.reduce((s, l) => s + l.so_far, 0);
  return {
    enabled,
    billingUrl: `${baseUrl}/app/billing`,
    period: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    daysInPeriod,
    lines, monthly, soFar,
    armed: Object.values(prices).some((v) => v > 0),
  };
}

module.exports = { billingView, tiesFor, tierKeyFor, ZERO };
