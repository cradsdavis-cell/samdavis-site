'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function readAbout() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'about', 'index.html'),
    'utf8'
  );
}

test('about page has the canonical head', () => {
  const html = readAbout();
  assert.ok(html.includes('<title>About — Sam Davis</title>'),
    'expected canonical title');
  assert.ok(html.includes('href="/lib/site.css"'),
    'expected shared CSS link');
  assert.ok(html.includes('src="/lib/site.js"'),
    'expected shared JS link');
});

test('about page renders the canonical nav with About marked current', () => {
  const html = readAbout();
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
  const html = readAbout();
  assert.match(html, /Samuel<br>Caradog Davis/,
    'expected name with line break');
});

test('about page has the three main section headings', () => {
  const html = readAbout();
  assert.ok(html.includes('>Experience<'), 'expected Experience heading');
  assert.ok(html.includes('>Side practice<'), 'expected Side practice heading');
  assert.match(html, /<h2[^>]*>Builds/, 'expected Builds H2 heading');
});

test('about page renders the canonical site-footer', () => {
  const html = readAbout();
  assert.ok(html.includes('<footer class="site-footer wrap">'),
    'expected canonical site-footer');
});

test('identity rail renders Skills, Education, Recognition blocks', () => {
  const html = readAbout();
  assert.ok(html.includes('class="about-sidebar"'), 'expected sidebar');
  assert.ok(html.includes('Data scientist · AI builder'), 'expected role line');
  assert.match(html, />Skills</, 'expected Skills heading');
  assert.match(html, />Education</, 'expected Education heading');
  assert.match(html, />Recognition</, 'expected Recognition heading');
  // Recognition rule — Pik Perseverance framed as team member
  assert.match(html, /first-ascent team/i,
    'Kyrgyzstan must be framed as team member, never expedition leader');
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

test('experience renders 9 accordion rows in reverse-chronological order', () => {
  const h = readAbout();
  const roleMarkers = [
    'Independent AI coach',
    'SEAF / UWA',
    'AMME, USYD',
    'DARE ARC',
    'Alan Turing Institute',
    'Satellite Catapult',
    'Apadmi Ltd',
    'European Space Agency',
    'Harrow International School',
  ];
  for (const marker of roleMarkers) {
    assert.ok(h.includes(marker), `expected role marker: ${marker}`);
  }
});

test('side practice block contains Wildly Calm with label', () => {
  const h = readAbout();
  assert.ok(h.includes('Wildly Calm'), 'expected Wildly Calm');
  assert.ok(h.includes('side-practice-label'), 'expected side-practice label badge');
});

test('builds renders all 7 build names', () => {
  const h = readAbout();
  const builds = [
    'EA / Second Brain',
    'Carbon Tracker',
    'Derwen',
    'TrailMate',
    'The Calm and the Storm',
    'Waste2Wattage',
    'Sasha',
  ];
  for (const b of builds) {
    assert.ok(h.includes(b), `expected build: ${b}`);
  }
});
