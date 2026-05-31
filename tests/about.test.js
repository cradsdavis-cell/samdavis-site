'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'about', 'index.html'),
  'utf8'
);

test('about page has the canonical head', () => {
  assert.ok(html.includes('<title>About — Sam Davis</title>'),
    'expected canonical title');
  assert.ok(html.includes('href="/lib/site.css"'),
    'expected shared CSS link');
  assert.ok(html.includes('src="/lib/site.js"'),
    'expected shared JS link');
});

test('about page renders the canonical nav with About marked current', () => {
  assert.ok(html.includes('<nav class="site-nav-bar">'),
    'expected canonical site-nav-bar');
  assert.match(html, /<a[^>]*href="\/about"[^>]*class="current"[^>]*>About<\/a>|<a[^>]*class="current"[^>]*href="\/about"[^>]*>About<\/a>/,
    'expected About link marked current (attribute order agnostic)');
  assert.ok(html.includes('<a href="/">Home</a>'));
  assert.ok(html.includes('<a href="/overview">Overview</a>'));
  assert.ok(html.includes('<a href="/offer">Offer</a>'));
  assert.ok(html.includes('<a href="/book">Book →</a>'));
});

test('about page has identity rail with name', () => {
  assert.match(html, /Samuel<br>Caradog Davis/,
    'expected name with line break');
});

test('about page has the three main section headings', () => {
  assert.ok(html.includes('>Experience<'), 'expected Experience heading');
  assert.ok(html.includes('>Side practice<'), 'expected Side practice heading');
  assert.match(html, /<h2[^>]*>Builds/, 'expected Builds H2 heading');
});

test('about page renders the canonical site-footer', () => {
  assert.ok(html.includes('<footer class="site-footer wrap">'),
    'expected canonical site-footer');
});

const NAV_PAGES = [
  'index.html',
  'overview/index.html',
  'offer/index.html',
  'thanks.html',
  'booking-failed.html',
  'book/index.html',
  'book/coaching-block.html',
  'book/discovery.html',
  'book/ea-basic-build.html',
  'book/single-session.html',
];

test('every nav-bearing page links to /about between Overview and Offer', () => {
  for (const rel of NAV_PAGES) {
    const fp = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(fp, 'utf8');
    // The About link must appear AFTER the Overview link and BEFORE the Offer link.
    const idxOverview = src.indexOf('<a href="/overview"');
    const idxAbout = src.indexOf('<a href="/about"');
    const idxOffer = src.indexOf('<a href="/offer"');
    assert.ok(idxOverview > -1, `${rel}: missing Overview link`);
    assert.ok(idxAbout > -1, `${rel}: missing About link`);
    assert.ok(idxOffer > -1, `${rel}: missing Offer link`);
    assert.ok(idxOverview < idxAbout && idxAbout < idxOffer,
      `${rel}: About must sit between Overview and Offer`);
  }
});
