'use strict';
// /app/billing — money v2 + the billing placeholder (ruled 2026-08-23).
// The page carries the SWITCH (billing_enabled, user-flipped), the NUMBER
// (two figures computed on read) and the LINES (tier + hosting per rock,
// hosting per direct pebble, anchored pebbles pointed at their rock).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { billingView, tiesFor, tierKeyFor } = require('../lib/appBilling');

const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'app', 'billing.js'), 'utf8');
const authSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'appAuth.js'), 'utf8');

const NOW = Date.UTC(2026, 7, 23, 12); // 23 Aug 2026, a 31-day month
const EVENTS = [
  { type: 'box-built', at: Date.UTC(2026, 7, 18), slug: 'acme' },
  { type: 'member-join', at: Date.UTC(2026, 7, 19), org: 'acme-org', e: 'h1', role: 'member', slug: 'bob', rel: 'anchored', status: 'active' },
  { type: 'member-join', at: Date.UTC(2026, 7, 19), org: 'acme-org', e: 'h2', role: 'member', slug: 'cat', rel: 'joined', status: 'active' },
  { type: 'member-join', at: Date.UTC(2026, 7, 20), org: 'acme-org', e: 'h3', role: 'member', slug: 'dan', rel: 'joined', status: 'active' },
  { type: 'member-left', at: Date.UTC(2026, 7, 21), org: 'acme-org', e: 'h3', role: 'member', slug: 'dan' },
];
const MINERALS = [
  { mineral_id: 'm1', label: 'Acme', host: 'acme.crads-ai.com', tier: 'rock', org: 'acme-org', anchor: '', held_by: 'you' },
  { mineral_id: 'm2', label: 'Solo', host: 'solo.crads-ai.com', tier: 'pebble', anchor: '', held_by: 'you' },
  { mineral_id: 'm3', label: 'Bob', host: 'bob.crads-ai.com', tier: 'pebble', anchor: 'acme-org', held_by: 'you' },
  { mineral_id: 'm4', label: 'Theirs', host: 'x.crads-ai.com', tier: 'pebble', anchor: '', held_by: 'someone else' },
];
const BANDS = { 'crads-rock-tier-1': { seats: 2 }, 'crads-rock-tier-2': { seats: 10 } };

test('tiesFor: seats are every live tie, anchored counted separately, a left member is gone', () => {
  assert.deepEqual(tiesFor(EVENTS).get('acme-org'), { seats: 2, anchored: 1 });
});

test('tierKeyFor: the seat count picks the tier; over every band lands on the top tier', () => {
  assert.equal(tierKeyFor(2, BANDS), 'crads-rock-tier-1');
  assert.equal(tierKeyFor(3, BANDS), 'crads-rock-tier-2');
  assert.equal(tierKeyFor(99, BANDS), 'crads-rock-tier-2');
});

test('billingView at $0: the structure stands, every figure is honestly zero, lines are right', () => {
  const v = billingView({ user: { billing_enabled: false }, minerals: MINERALS, events: EVENTS, bands: BANDS, now: NOW });
  assert.equal(v.enabled, false);
  assert.equal(v.armed, false);
  assert.equal(v.monthly, 0);
  assert.equal(v.soFar, 0);
  assert.deepEqual(v.lines.map((l) => l.kind), ['rock', 'pebble-direct', 'pebble-anchored'], 'held only; the anchored pebble is shown but pointed at its rock');
  const rock = v.lines[0];
  assert.equal(rock.seats, 2, 'bob + cat; dan left');
  assert.equal(rock.hosting, 2, 'own box + bob');
  assert.equal(rock.tier, 'crads-rock-tier-1');
  assert.equal(rock.days_so_far, 6, 'built on the 18th, read at noon on the 23rd: 5.5 days rounds UP, never down to free');
  assert.equal(v.lines[1].days_so_far, 23, 'no build event: present since the 1st, so every day of the period so far');
});

test('billingView with prices: a rock is TIER + HOSTING, seats are never money, so-far is pro-rated by days', () => {
  const prices = { tier: 10000, hosting: 2000, direct: 3000 };
  const v = billingView({ user: { billing_enabled: true }, minerals: MINERALS, events: EVENTS, bands: BANDS, now: NOW, prices });
  assert.equal(v.armed, true);
  const rock = v.lines[0];
  assert.equal(rock.monthly, 10000 + 2000 * 2, 'tier + 2 hosting; the joined member costs nothing');
  assert.equal(rock.so_far, Math.round(14000 * 6 / 31));
  assert.equal(v.lines[1].monthly, 3000);
  assert.equal(v.lines[2].monthly, 0, 'an anchored pebble has no line of its own');
  assert.equal(v.monthly, 17000);
});

test('the page carries the switch, gates the four growing acts, and never gates a reducing one', () => {
  assert.match(src, /billing_enabled/, 'the switch is the user-record field');
  assert.match(src, /req\.method === 'POST'/, 'the user flips it');
  assert.match(src, /create minerals, promote a pebble, anchor to a rock (and|or) receive a transfer/, 'the four gated acts are named');
  assert.match(src, /Leaving, downgrading and removing always work/, 'and the never-gated ones');
  assert.match(src, /Nothing is charged today/);
  assert.match(src, /onsubmit="return confirm\(/, 'turning billing OFF asks first and says what it blocks');
  assert.match(src, /Nothing is being charged either way/, 'an unreadable mineral list still cannot cost money');
  assert.ok(!/billingPortal/.test(src) && !/engagement/i.test(src), 'coaching stays out of the product page');
});

test('the app token carries the billing claim, and absent means false', () => {
  assert.match(authSrc, /billing: !!billingEnabled/);
  for (const f of ['lib/appHandoff.js', 'lib/invitationPage.js', 'lib/directory.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const mints = (s.match(/mintAppToken\(\{/g) || []).length;
    const withClaim = (s.match(/billingEnabled: !!user\.billing_enabled/g) || []).length;
    assert.equal(withClaim, mints, `${f}: every mint passes the claim`);
  }
});

test('coaching URLs still answer for existing clients (the handlers survive unrouted from /app)', () => {
  for (const f of ['subscription.js', 'packs.js', 'sessions.js', 'book.js']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'api', 'account', f)), `${f} still exists at its old URL`);
  }
});

test('every line carries its breakdown: component × quantity = amount, and the anchored pebble shows what its rock carries', () => {
  const prices = { tier: 10000, hosting: 2000, direct: 3000 };
  const v = billingView({ user: { billing_enabled: true }, minerals: MINERALS, events: EVENTS, bands: BANDS, now: NOW, prices });
  const rock = v.lines[0];
  assert.deepEqual(rock.parts.map((p) => [p.label, p.unit, p.qty, p.amount]), [
    ['Tier 1 (2 members)', 10000, 1, 10000],
    ['Hosting, 2 boxes', 2000, 2, 4000],
  ]);
  assert.equal(rock.parts.reduce((s, p) => s + p.amount, 0), rock.monthly, 'the parts sum to the line');
  assert.deepEqual(v.lines[1].parts, [{ label: 'Hosting, 1 box', unit: 3000, qty: 1, amount: 3000 }]);
  const anchored = v.lines[2].parts[0];
  assert.equal(anchored.carried, 2000, 'what the rock pays for this box');
  assert.equal(anchored.amount, 0, 'and nothing lands on this account');
  assert.match(src, /So far this period/, 'the page shows the accrued figure per line');
});

test('the indicative rate card (Sam, 11 Aug) prices the page without charging anyone', () => {
  const { priceTable, INDICATIVE } = require('../lib/pricing');
  assert.equal(INDICATIVE.charging, false, 'display only until a price is armed on Stripe');
  const v = billingView({ user: { billing_enabled: true }, minerals: MINERALS, events: EVENTS, now: NOW, prices: priceTable() });
  assert.equal(v.priced, true);
  assert.equal(v.charging, false);
  const rock = v.lines[0];
  assert.equal(rock.tier, 'crads-rock-tier-1', 'bands come from the card when the caller passes none');
  assert.equal(rock.monthly, 14900 + 4900 * 2, '$149 tier + 2 × $49 hosting');
  assert.equal(v.lines[1].monthly, 19900, 'a direct pebble at $199');
  assert.match(src, /Indicative pricing/, 'the page says the numbers are indicative');
  assert.match(src, /no card is charged and no invoice is sent/, 'and that nothing is collected');
});

test('a bigger rock pays a bigger tier fee: the band picks the tier, the tier picks the fee', () => {
  const { priceTable } = require('../lib/pricing');
  const many = Array.from({ length: 60 }, (_, i) => ({ type: 'member-join', at: NOW - 1000, org: 'acme-org', e: `h${i}`, role: 'member', slug: `p${i}`, rel: 'joined', status: 'active' }));
  const v = billingView({ user: { billing_enabled: true }, minerals: [MINERALS[0]], events: many, now: NOW, prices: priceTable() });
  assert.equal(v.lines[0].seats, 60);
  assert.equal(v.lines[0].tier, 'crads-rock-tier-2');
  assert.equal(v.lines[0].parts[0].amount, 44900);
  assert.equal(v.lines[0].monthly, 44900 + 4900, '60 joined members cost nothing per head; the tier stepped up once');
});
