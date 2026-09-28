// tests/roadmapEmail.test.js - the roadmap buyer's one confirmation email
// (2026-09-28): the call time in Sydney time, one thing to prepare, when the
// report lands. No sign-in link, no portal, no em dashes.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { roadmapConfirmationText, fmtCallTime } = require('../lib/email');
const { createsAccount } = require('../lib/skus');

test('the confirmation names the call time, the prep and the 3-business-day report', () => {
  const t = roadmapConfirmationText({ name: 'Rhi Jones', slotIso: '2026-10-01T00:00:00.000Z' });
  assert.match(t, /^Hi Rhi,/);
  assert.match(t, /Thanks for booking your AI problem-solving roadmap\. Your call is on Thu 1 Oct, 10:00 am AEST \(the link is in your calendar invite\)\./);
  assert.match(t, /jot down the problem as it shows up in your week, and who it affects/);
  assert.match(t, /within 3 business days of the call/);
  assert.ok(!/sign in|set up your account|verify-token|http/i.test(t), 'no account or sign-in link');
  assert.ok(!t.includes('\u2014'), 'no em dashes');
});

test('an unparseable slot falls back to the invite, and a missing name still greets', () => {
  assert.strictEqual(fmtCallTime('nope'), null);
  const t = roadmapConfirmationText({ name: '', slotIso: 'nope' });
  assert.match(t, /^Hi,/);
  assert.match(t, /The time and link for your call are in your calendar invite\./);
});

test('only the roadmap opts out of the client account', () => {
  assert.strictEqual(createsAccount('roadmap'), false);
  assert.strictEqual(createsAccount('walkthrough'), true);
  assert.strictEqual(createsAccount('guided-setup'), true);
  assert.strictEqual(createsAccount('coaching-block'), true);
});
