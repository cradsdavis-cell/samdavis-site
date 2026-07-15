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

test('post-s4-decision hero offers retainer', () => {
  const user = { state: 'post-s4-decision', email: 'a@b.com' };
  const html = renderHeroCard({ user, nextSession: null });
  assert.match(html, /Retainer|retainer/);
  assert.match(html, /\$650/);
});

test('retainer-active hero shows monthly cadence', () => {
  const user = { state: 'retainer-active', email: 'a@b.com' };
  const nextSession = { date: '2026-08-01T14:00:00+10:00', label: 'monthly' };
  const html = renderHeroCard({ user, nextSession });
  assert.match(html, /Retainer active|retainer/i);
});

test('graduated hero offers Single Session CTA', () => {
  const user = { state: 'graduated', email: 'a@b.com' };
  const html = renderHeroCard({ user, nextSession: null });
  assert.match(html, /Alumni|alumni/);
  assert.match(html, /Single Session/);
});

