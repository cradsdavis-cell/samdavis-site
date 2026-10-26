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
  assert.match(t, /Thanks for booking your AI roadmap\. Your call is on Thu 1 Oct, 10:00 am AEST \(the link is in your calendar invite\)\./);
  assert.match(t, /jot down what's slow, what's stuck and what you're carrying in your head\. We'll go through all of it\./);
  assert.ok(!/the problem as it shows up|who it affects|problem-solving/.test(t), 'no one-problem framing (2026-10-22)');
  assert.match(t, /within 3 business days of the call/);
  assert.match(t, /a second 30-minute call where we go through it together/);
  assert.ok(!/sign in|set up your account|verify-token/i.test(t), 'no account or sign-in link');
  const links = t.match(/https?:\/\/\S+/g) || [];
  assert.deepStrictEqual(links, [
    'https://crads-ai.com/guides/claude-remember-your-business',
    'https://crads-ai.com/lib/video/crads-ai-foundation.mp4',
  ], 'the only links are the two greatest hits');
  assert.ok(!t.includes('\u2014'), 'no em dashes');
});

// Content card (21 Oct 2026): one "if it's useful before we talk" block after
// the prep line, with the guide and the 90-second film, both served by this site.
test('the greatest hits follow the prep line, and both links resolve on the site', () => {
  const t = roadmapConfirmationText({ name: 'Rhi Jones', slotIso: '2026-10-01T00:00:00.000Z' });
  const prep = t.indexOf("We'll go through all of it.");
  const hits = t.indexOf("If it's useful before we talk:");
  assert.ok(prep > -1 && hits > prep, 'the block comes after the before-the-call lines');
  assert.ok(hits < t.indexOf('Your written roadmap follows'), 'and before the report line');
  assert.match(t, /- Why Claude forgets your business, and the fix \(a 4-minute read\): https:\/\/crads-ai\.com\/guides\/claude-remember-your-business\n/);
  assert.match(t, /- The whole idea in 90 seconds \(a short film\): https:\/\/crads-ai\.com\/lib\/video\/crads-ai-foundation\.mp4\n/);
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'guides/claude-remember-your-business/index.html')), 'the guide is served');
  assert.ok(fs.existsSync(path.join(root, 'lib/video/crads-ai-foundation.mp4')), 'the film is served');
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
