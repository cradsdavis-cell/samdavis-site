'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

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
  for (const href of ['/', '/overview', '/about', '/offer', '/book']) {
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

const NAV_PAGES = [
  'index.html',
  'overview/index.html',
  'about/index.html',
  'offer/index.html',
  'thanks.html',
  'booking-failed.html',
  'book/index.html',
  'book/coaching-block.html',
  'book/discovery.html',
  'book/ea-basic-build.html',
  'book/single-session.html',
];

// 2026-08-16: was "How it works between About and Offer". In the grouped nav
// /how-it-works sits inside the Coaching menu and /about is a top-level link
// after it, so the ordering inverted and this could never pass again. The
// destination check is in tests/about.test.js; here we keep the pairing that
// still means something, that /how-it-works ships alongside /offer wherever the
// Coaching menu exists.
test('every nav-bearing page carries /how-it-works next to /offer', () => {
  for (const rel of NAV_PAGES) {
    const fp = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(fp, 'utf8');
    assert.ok(src.includes('<a href="/how-it-works"'), `${rel}: missing How it works link`);
    assert.ok(src.includes('<a href="/offer"'), `${rel}: missing Offer link`);
    const coaching = src.match(/<div class="nav-group"[^>]*data-group="coaching"[^>]*>[\s\S]*?<\/div>\s*<\/div>/);
    if (!coaching) continue;
    assert.ok(coaching[0].includes('/how-it-works'),
      `${rel}: /how-it-works must sit in the Coaching group`);
  }
});
