'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { computeBalance, engagementBalance, sessionsForSku, initialSessionsUsed } = require('../lib/sessionBalance');

test('sessionsForSku + initialSessionsUsed per SKU', () => {
  assert.strictEqual(sessionsForSku('coaching-block'), 4);
  assert.strictEqual(sessionsForSku('single-session'), 1);
  assert.strictEqual(sessionsForSku('continuation-retainer'), null);
  assert.strictEqual(sessionsForSku('unknown'), null);
  assert.strictEqual(initialSessionsUsed('coaching-block'), 1); // S1 booked at checkout
  assert.strictEqual(initialSessionsUsed('single-session'), 1);
  assert.strictEqual(initialSessionsUsed('group-block'), 0);
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

test('single-session + group-block are not portal-bookable blocks', () => {
  const single = computeBalance({ state: 'pre-s1', engagements: [{ type: 'single-session', sessions_total: 1, sessions_used: 1 }] });
  assert.strictEqual(single.hasBlock, false);
  assert.strictEqual(single.bookable, false);
  const group = computeBalance({ state: 'cohort-active', engagements: [{ type: 'group-block', sessions_total: 4, sessions_used: 0 }] });
  assert.strictEqual(group.hasBlock, false);
});
