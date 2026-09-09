'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderHeroCard, getNextSessionLabel } = require('../lib/journeyTracker');

test('pre-s1 hero shows S1 date + install reminder', () => {
  const user = { state: 'pre-s1', email: 'a@b.com', onboarding: { install_checklist: { claude_code: true } } };
  const nextSession = { date: '2026-06-11T14:00:00+10:00', label: 'S1' };
  const html = renderHeroCard({ user, nextSession });
  assert.match(html, /first session/i);
  assert.match(html, /11 Jun|Jun 11/);
});

test('between-s1-s2 hero shows sandbox play + Pack 1 + next session', () => {
  const user = { state: 'between-s1-s2', email: 'a@b.com' };
  const nextSession = { date: '2026-06-18T14:00:00+10:00', label: 'S2' };
  const html = renderHeroCard({ user, nextSession });
  assert.match(html, /sandbox/i);
  assert.match(html, /Pack 1/);
});

test('between-s2-s3 hero unlocks Pack 2 + flower exercise', () => {
  const user = { state: 'between-s2-s3', email: 'a@b.com' };
  const nextSession = { date: '2026-06-25T14:00:00+10:00', label: 'S3' };
  const html = renderHeroCard({ user, nextSession });
  assert.match(html, /Pack 2/);
  assert.match(html, /flower/i);
});

test('between-s3-s4 hero unlocks Pack 3', () => {
  const user = { state: 'between-s3-s4', email: 'a@b.com' };
  const nextSession = { date: '2026-07-02T14:00:00+10:00', label: 'S4' };
  const html = renderHeroCard({ user, nextSession });
  assert.match(html, /Pack 3/);
});

test('post-s4-decision hero offers a working session (the retainer is retired, v4)', () => {
  const user = { state: 'post-s4-decision', email: 'a@b.com' };
  const html = renderHeroCard({ user, nextSession: null });
  assert.match(html, /working session/i);
  assert.match(html, /href="\/book\/working-session"/);
  assert.doesNotMatch(html, /\$650|Retainer/);
});

test('retainer-active hero shows monthly cadence', () => {
  const user = { state: 'retainer-active', email: 'a@b.com' };
  const nextSession = { date: '2026-08-01T14:00:00+10:00', label: 'monthly' };
  const html = renderHeroCard({ user, nextSession });
  assert.match(html, /Retainer active|retainer/i);
});

test('graduated hero offers a working session', () => {
  const user = { state: 'graduated', email: 'a@b.com' };
  const html = renderHeroCard({ user, nextSession: null });
  assert.match(html, /Alumni|alumni/);
  assert.match(html, /href="\/book\/working-session"/);
});

test('guided-setup client sees the two-session hero, not pack copy', () => {
  const user = { state: 'pre-s1', email: 'g@b.com',
    engagements: [{ type: 'guided-setup', sessions_total: 2, sessions_used: 1, first_slot_iso: '2026-10-01T10:00:00+10:00' }] };
  const balance = { hasBlock: true, remaining: 1, used: 1, total: 2, activeBlock: user.engagements[0], isRetainer: false, bookable: true };
  const html = renderHeroCard({ user, nextSession: { date: '2026-10-01T10:00:00+10:00', label: 'Guided setup session' }, balance });
  assert.match(html, /Session 1 of 2/);
  assert.match(html, /1 Oct|Oct 1/);
  assert.match(html, /href="\/account\/book"/);
  assert.doesNotMatch(html, /Pack 1|sandbox/);
  const done = renderHeroCard({ user: { ...user, state: 'between-s1-s2', engagements: [{ type: 'guided-setup', sessions_total: 2, sessions_used: 2 }] },
    nextSession: null, balance: { ...balance, remaining: 0, used: 2, activeBlock: null } });
  assert.match(done, /Both sessions booked/);
  assert.match(done, /href="\/book\/working-session"/);
});

