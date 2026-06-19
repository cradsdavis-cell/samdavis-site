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
  assert.ok(html.includes('Pack 2'), 'expected Pack 2 named');
  assert.ok(html.includes('Pack 3'), 'expected Pack 3 named');
  assert.ok(html.includes('Pack 4'), 'expected Pack 4 named');
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
