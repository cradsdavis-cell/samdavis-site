'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { NAV_ITEMS } = require('../lib/site.js');

function readHIW() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'how-it-works', 'index.html'),
    'utf8'
  );
}

test('how-it-works page has the canonical head', () => {
  const html = readHIW();
  assert.ok(html.includes('<title>How it works · Crads-AI</title>'),
    'expected canonical title');
  assert.ok(html.includes('href="/lib/site.css"'),
    'expected shared CSS link');
  assert.ok(html.includes('src="/lib/site.js"'),
    'expected shared JS link');
});

// 2026-08-16: same staleness as tests/about.test.js. It pinned exact nav markup
// from the retired flat nav, so an added aria-label, renamed labels and a second
// class name each read as a missing nav. Rule now: assert destinations and the
// current-marker, not the attributes or the visible label.
test('how-it-works page renders the canonical nav with How it works marked current', () => {
  const html = readHIW();
  assert.match(html, /<nav class="site-nav-bar"[^>]*>/,
    'expected canonical site-nav-bar');
  assert.match(html, /<a[^>]*href="\/how-it-works"[^>]*class="[^"]*\bcurrent\b[^"]*"[^>]*>How it works<\/a>/,
    'expected How it works link marked current (tolerates a class list)');
  for (const href of ['/', ...NAV_ITEMS.map((i) => i.href)]) {
    assert.ok(html.includes(`href="${href}"`), `expected nav link to ${href}`);
  }
});

// 2026-09-09 (v4): the four-session coaching arc, the packs and the private
// dashboard left this page with the Coaching Block. The four layers stay; the
// page now ends on what you have once it is running and where Sam comes in.
test('how-it-works page keeps the four layers and drops the coaching arc', () => {
  const html = readHIW();
  for (const h of ['>Context<', '>Connections<', '>Capabilities<', '>Cadence<']) {
    assert.ok(html.includes(h), `expected layer heading ${h}`);
  }
  assert.ok(html.includes('id="the-four-layers"'), 'expected the four-layers section');
  assert.match(html, />Where it lives</, 'expected the where-it-lives section');
  assert.match(html, />What you have once it is running</, 'expected the after section');
  assert.match(html, />Free to run\. Paid when you want a hand\.</, 'expected the where-Sam-comes-in card');
  for (const gone of ['The 4-session arc', 'Everything you get', 'Pack 0', 'Pack 1', 'Pack 2', 'Pack 3', 'private dashboard', 'Continuation Retainer', 'Coaching Block']) {
    assert.ok(!html.includes(gone), `${gone} should be gone`);
  }
  assert.ok(!html.includes('data-lead-capture'), 'lead-magnet capture form must stay removed');
  assert.ok(!/free install guide/i.test(html), 'free-install-guide lead-magnet copy must stay removed');
  assert.match(html, /href="\/download"/, 'expected a Download CTA');
});

test('how-it-works page contains CTAs to /offer and /book/discovery', () => {
  const html = readHIW();
  assert.match(html, /href="\/offer"/, 'expected /offer link');
  assert.match(html, /href="\/book\/discovery"/, 'expected /book/discovery link');
});

test('how-it-works page renders the canonical site-footer', () => {
  const html = readHIW();
  assert.ok(html.includes('<footer class="site-footer wrap">'),
    'expected canonical site-footer');
});

// 2026-09-09: the per-page nav loop moved to tests/navConsistency.test.js.
