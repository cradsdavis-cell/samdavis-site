'use strict';
// tests/coachingUnlisted.test.js — arc A6, ruling 2: "marketing off, plumbing
// on". Coaching leaves the navigation because crads-ai.com is the product's
// home now; it does NOT leave the internet, because live clients hold those
// links, Stripe returns to them, and Cal.com books through them.
//
// Both halves are pinned here, because the dangerous version of this change is
// the one that quietly takes a paying client's booking page down with the nav.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { renderSidebar } = require('../lib/account');

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('the coaching pages are no longer advertised in the account nav', () => {
  const nav = renderSidebar({ activeRoute: 'home', isAdmin: false });
  for (const gone of ['Book a session', 'Sessions', 'Packs', 'Subscription']) {
    assert.ok(!nav.includes(gone), `"${gone}" is still in the nav`);
  }
  assert.ok(nav.includes('Home'), 'a coaching client still has their landing');
  assert.ok(nav.includes('Profile'), 'and their own details');
  assert.ok(nav.includes('/api/auth/logout'), 'and a way out');
});

test('every coaching route still EXISTS and is still gated — unlisted is not deleted', () => {
  const routes = [
    'api/account/book.js', 'api/account/sessions.js', 'api/account/packs.js',
    'api/account/subscription.js', 'api/account/onboarding.js', 'api/account/index.js',
  ];
  for (const r of routes) {
    assert.ok(existsSync(join(ROOT, r)), `${r} was deleted`);
    assert.match(read(r), /requireAuth/, `${r} lost its gate`);
  }
});

test('the money and booking plumbing is untouched', () => {
  for (const f of ['api/checkout.js', 'api/stripe/webhook.js', 'api/cal/availability.js',
                   'api/booking-status.js', 'api/cron/graduate-check.js']) {
    assert.ok(existsSync(join(ROOT, f)), `${f} was deleted`);
  }
  // the webhook is what creates client records at all; it must stay raw-body
  assert.match(read('api/stripe/webhook.js'), /bodyParser: false/, 'the Stripe signature check still works');
  // /account/book's picker depends on this endpoint by URL
  assert.match(read('api/account/book.js'), /\/api\/cal\/availability/);
});

test('the URLs clients already hold still resolve: rewrites and static pages survive', () => {
  const cfg = JSON.parse(read('vercel.json'));
  const sources = new Set(cfg.rewrites.map((r) => r.source));
  for (const url of ['/account/book', '/account/sessions', '/account/packs', '/account/subscription']) {
    assert.ok(sources.has(url), `${url} lost its rewrite — a client's link would 404`);
  }
  for (const page of ['book/index.html', 'book/single-session.html', 'book/coaching-block.html',
                      'book/continuation-retainer.html', 'thanks.html']) {
    assert.ok(existsSync(join(ROOT, page)), `${page} was deleted`);
  }
});

test('Home still links to the unlisted pages, so a client is never stranded', () => {
  const home = read('api/account/index.js');
  const links = ['/account/book', '/account/sessions', '/account/packs', '/account/subscription'];
  const found = links.filter((l) => home.includes(l));
  assert.ok(found.length >= 2, `Home should still route clients onward; found ${found.join(', ') || 'none'}`);
});
