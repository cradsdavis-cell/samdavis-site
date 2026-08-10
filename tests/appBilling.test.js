'use strict';
// /app/billing — product only (Sam's ruling, 2026-08-10 app audit): coaching
// engagements and the coaching Stripe portal left the product app. The page
// states the one headline fact (nothing charged, pricing unarmed) and lists
// what WILL be billed, per held mineral, at $0 today.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'app', 'billing.js'), 'utf8');

test('coaching is gone from the product app\'s billing', () => {
  assert.ok(!/engagement/i.test(src), 'coaching packs no longer render here');
  assert.ok(!/require\('stripe'\)/.test(src), 'no coaching Stripe portal on the product page');
  assert.ok(!/billingPortal/.test(src), 'no portal session minted');
});

test('the page states the headline fact and never invents a figure', () => {
  assert.match(src, /Nothing is being charged today/);
  assert.match(src, /pricing is not switched on yet/i);
  assert.match(src, /\$0 today/, 'held minerals are listed as future lines at zero');
  assert.match(src, /Nothing is being charged either way/, 'an unreadable mineral list still cannot cost money');
});

test('coaching URLs still answer for existing clients (the handlers survive unrouted from /app)', () => {
  for (const f of ['subscription.js', 'packs.js', 'sessions.js', 'book.js']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'api', 'account', f)), `${f} still exists at its old URL`);
  }
});
