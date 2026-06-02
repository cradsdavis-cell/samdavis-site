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

test('how-it-works page renders the canonical nav with How it works marked current', () => {
  const html = readHIW();
  assert.ok(html.includes('<nav class="site-nav-bar">'),
    'expected canonical site-nav-bar');
  assert.match(html, /<a[^>]*href="\/how-it-works"[^>]*class="current"[^>]*>How it works<\/a>|<a[^>]*class="current"[^>]*href="\/how-it-works"[^>]*>How it works<\/a>/,
    'expected How it works link marked current (attribute order agnostic)');
  assert.ok(html.includes('<a href="/">Home</a>'));
  assert.ok(html.includes('<a href="/overview">Overview</a>'));
  assert.ok(html.includes('<a href="/about">About</a>'));
  assert.ok(html.includes('<a href="/offer">Offer</a>'));
  assert.ok(html.includes('<a href="/book">Book →</a>'));
});

test('how-it-works page contains all 4 session-arc heading lines', () => {
  const html = readHIW();
  assert.ok(html.includes('Session 1 — install + foundation'),
    'expected Session 1 heading');
  assert.ok(html.includes('Session 2 — first build'),
    'expected Session 2 heading');
  assert.ok(html.includes('Session 3 — second build + integration'),
    'expected Session 3 heading');
  assert.ok(html.includes('Session 4 — graduation'),
    'expected Session 4 heading');
});

test('how-it-works page contains onboarding + first 2 weeks blocks', () => {
  const html = readHIW();
  assert.match(html, />Onboarding \(before Session 1\)</,
    'expected Onboarding heading');
  assert.match(html, />Your first 2 weeks</,
    'expected Your first 2 weeks heading');
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

test('every nav-bearing page links to /how-it-works between About and Offer', () => {
  for (const rel of NAV_PAGES) {
    const fp = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(fp, 'utf8');
    const idxAbout = src.indexOf('<a href="/about"');
    const idxHIW = src.indexOf('<a href="/how-it-works"');
    const idxOffer = src.indexOf('<a href="/offer"');
    assert.ok(idxAbout > -1, `${rel}: missing About link`);
    assert.ok(idxHIW > -1, `${rel}: missing How it works link`);
    assert.ok(idxOffer > -1, `${rel}: missing Offer link`);
    assert.ok(idxAbout < idxHIW && idxHIW < idxOffer,
      `${rel}: How it works must sit between About and Offer`);
  }
});
