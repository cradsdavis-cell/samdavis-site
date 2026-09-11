'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { computeBalance, engagementBalance, sessionsForSku, initialSessionsUsed, minGapMsFor } = require('../lib/sessionBalance');

test('sessionsForSku + initialSessionsUsed per SKU', () => {
  assert.strictEqual(sessionsForSku('coaching-block'), 4);
  assert.strictEqual(sessionsForSku('single-session'), 1);
  assert.strictEqual(sessionsForSku('continuation-retainer'), null);
  assert.strictEqual(sessionsForSku('unknown'), null);
  assert.strictEqual(initialSessionsUsed('coaching-block'), 1); // S1 booked at checkout
  assert.strictEqual(initialSessionsUsed('single-session'), 1);
});

test('fresh block: 1 of 4 used, 3 left, bookable', () => {
  const user = { state: 'between-s1-s2', engagements: [{ type: 'coaching-block', sessions_total: 4, sessions_used: 1 }] };
  const b = computeBalance(user);
  assert.strictEqual(b.total, 4);
  assert.strictEqual(b.used, 1);
  assert.strictEqual(b.remaining, 3);
  assert.strictEqual(b.hasBlock, true);
  assert.strictEqual(b.bookable, true);
  assert.ok(b.activeBlock);
});

test('completed block: nothing left, not bookable', () => {
  const user = { state: 'post-s4-decision', engagements: [{ type: 'coaching-block', sessions_total: 4, sessions_used: 4, completed: true }] };
  const b = computeBalance(user);
  assert.strictEqual(b.remaining, 0);
  assert.strictEqual(b.bookable, false);
  assert.strictEqual(b.activeBlock, null);
});

test('two blocks (one done, one active): aggregates + picks the active one to draw down', () => {
  const active = { type: 'coaching-block', sessions_total: 4, sessions_used: 1 };
  const user = { state: 'between-s1-s2', engagements: [
    { type: 'coaching-block', sessions_total: 4, sessions_used: 4, completed: true },
    active,
  ] };
  const b = computeBalance(user);
  assert.strictEqual(b.total, 8);
  assert.strictEqual(b.used, 5);
  assert.strictEqual(b.remaining, 3);
  assert.strictEqual(b.activeBlock, active);
});

test('legacy active block without counters → assumes S1 used', () => {
  const b = engagementBalance({ type: 'coaching-block' });
  assert.strictEqual(b.total, 4);
  assert.strictEqual(b.used, 1);
  assert.strictEqual(b.remaining, 3);
});

test('legacy completed block without counters → fully used', () => {
  const b = engagementBalance({ type: 'coaching-block', completed: true });
  assert.strictEqual(b.used, 4);
  assert.strictEqual(b.remaining, 0);
});

test('used capped at total; never negative', () => {
  assert.strictEqual(engagementBalance({ type: 'coaching-block', sessions_total: 4, sessions_used: 9 }).used, 4);
  assert.strictEqual(engagementBalance({ type: 'coaching-block', sessions_total: 4, sessions_used: -3 }).used, 0);
});

test('retainer state with no block → bookable via retainer, hasBlock false', () => {
  const user = { state: 'retainer-active', engagements: [{ type: 'continuation-retainer', active: true }] };
  const b = computeBalance(user);
  assert.strictEqual(b.hasBlock, false);
  assert.strictEqual(b.isRetainer, true);
  assert.strictEqual(b.bookable, true);
  assert.strictEqual(b.activeBlock, null);
});

test('single-session is not a portal-bookable block', () => {
  const single = computeBalance({ state: 'pre-s1', engagements: [{ type: 'single-session', sessions_total: 1, sessions_used: 1 }] });
  assert.strictEqual(single.hasBlock, false);
  assert.strictEqual(single.bookable, false);
});

// --- v4 (2026-09-09) ---

test('the session counts here agree with lib/skus.js for every slug both know', () => {
  const { sessionCountFor, SKU_SLUGS, LEGACY_SKU_DEFS } = require('../lib/skus');
  for (const slug of [...SKU_SLUGS, ...Object.keys(LEGACY_SKU_DEFS)]) {
    assert.strictEqual(sessionsForSku(slug), sessionCountFor(slug), slug);
  }
});

test('walkthrough: 2 sessions, session 1 used at checkout, 1 left, portal-bookable, 24h gap', () => {
  assert.strictEqual(sessionsForSku('walkthrough'), 2);
  assert.strictEqual(initialSessionsUsed('walkthrough'), 1);
  assert.strictEqual(minGapMsFor('walkthrough'), 86400000);
  const b = computeBalance({ state: 'pre-s1', engagements: [{ type: 'walkthrough', sessions_total: 2, sessions_used: 1 }] });
  assert.strictEqual(b.remaining, 1);
  assert.strictEqual(b.bookable, true);
  assert.strictEqual(b.activeBlock.type, 'walkthrough');
});

test('guided-setup: 2 sessions, session 1 used at checkout, 1 left, portal-bookable, 24h gap', () => {
  assert.strictEqual(sessionsForSku('guided-setup'), 2);
  assert.strictEqual(sessionsForSku('working-session'), 1);
  assert.strictEqual(initialSessionsUsed('guided-setup'), 1);
  assert.strictEqual(initialSessionsUsed('working-session'), 1);
  assert.strictEqual(initialSessionsUsed('continuation-retainer'), 0);
  assert.strictEqual(minGapMsFor('guided-setup'), 86400000);
  assert.strictEqual(minGapMsFor('coaching-block'), 0);
  const b = computeBalance({ state: 'pre-s1', engagements: [{ type: 'guided-setup', sessions_total: 2, sessions_used: 1 }] });
  assert.strictEqual(b.remaining, 1);
  assert.strictEqual(b.bookable, true);
  assert.strictEqual(b.activeBlock.type, 'guided-setup');
});

test('working-session is not portal-bookable (its one slot is booked at checkout)', () => {
  const b = computeBalance({ state: 'pre-s1', engagements: [{ type: 'working-session', sessions_total: 1, sessions_used: 1 }] });
  assert.strictEqual(b.hasBlock, false);
  assert.strictEqual(b.bookable, false);
});
