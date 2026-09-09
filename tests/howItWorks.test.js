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
  assert.ok(html.includes('<title>How it works — Sam Davis</title>'),
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

test('how-it-works page contains the 4 canonical session-arc headings', () => {
  const html = readHIW();
  assert.ok(html.includes('Up and running — and no longer scared of it'),
    'expected Session 1 heading (up and running)');
  assert.ok(html.includes('Teach it who you are'),
    'expected Session 2 heading (teach it who you are)');
  assert.ok(html.includes('Plug it into your actual day'),
    'expected Session 3 heading (plug it into your day)');
  assert.ok(html.includes('Running your week — without me'),
    'expected Session 4 heading (run it solo)');
});

test('how-it-works page names the materials and is discovery-only (no lead-magnet)', () => {
  const html = readHIW();
  assert.match(html, />Everything you get</, 'expected materials section');
  assert.ok(html.includes('Pack 0'), 'expected Pack 0 named');
  assert.ok(html.includes('Pack 1'), 'expected Pack 1 named');
  assert.ok(html.includes('Pack 2'), 'expected Pack 2 named');
  assert.ok(html.includes('Pack 3'), 'expected Pack 3 named');
  assert.ok(!html.includes('data-lead-capture'),
    'lead-magnet capture form must be removed (discovery-only)');
  assert.ok(!/free install guide/i.test(html),
    'free-install-guide lead-magnet copy must be removed');
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
