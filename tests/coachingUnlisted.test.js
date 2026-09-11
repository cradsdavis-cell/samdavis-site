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

// 2026-09-09 (v4): api/cron/graduate-check.js left this list. It advanced
// post-s4 clients to "graduated" after the retainer window; the retainer is
// retired and the cron entry went with it in the same commit (a cron pointing
// at a missing function fails the Vercel build).
test('the money and booking plumbing is untouched', () => {
  for (const f of ['api/checkout.js', 'api/stripe/webhook.js', 'api/cal/availability.js',
                   'api/booking-status.js']) {
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
  // 2026-09-09 (v4): the three coaching-era booking pages became redirects
  // (single-session, coaching-block -> guided-setup, continuation-retainer ->
  // /offer); 2026-09-11 (v5): working-session joined them (-> walkthrough, and
  // single-session repointed there so no redirect chains). A held link still
  // lands somewhere true. The pages that must exist are the v5 ones.
  for (const page of ['book/index.html', 'book/walkthrough.html', 'book/guided-setup.html', 'thanks.html']) {
    assert.ok(existsSync(join(ROOT, page)), `${page} was deleted`);
  }
  const redirected = new Set(cfg.redirects.map((r) => r.source));
  for (const url of ['/book/single-session', '/book/working-session', '/book/coaching-block', '/book/continuation-retainer']) {
    assert.ok(redirected.has(url), `${url} neither exists nor redirects: a client's link would 404`);
  }
});

test('Home still links to the unlisted pages, so a client is never stranded', () => {
  const home = read('api/account/index.js');
  const links = ['/account/book', '/account/sessions', '/account/packs', '/account/subscription'];
  const found = links.filter((l) => home.includes(l));
  assert.ok(found.length >= 2, `Home should still route clients onward; found ${found.join(', ') || 'none'}`);
});
