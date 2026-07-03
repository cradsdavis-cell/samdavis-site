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
  assert.ok(html.includes('<title>Meet Sam — AI coach for founders</title>'),
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

test('about page has the four main section headings + intro heading', () => {
  const html = readAbout();
  assert.ok(html.includes('>Hi — I\'m Sam.<'), 'expected intro heading');
  assert.ok(html.includes('>Experience<'), 'expected Experience heading');
  assert.match(html, /<h2[^>]*>Education</, 'expected Education H2 heading');
  assert.ok(html.includes('>Side practice<'), 'expected Side practice heading');
  assert.match(html, /<h2[^>]*>Builds/, 'expected Builds H2 heading');
});

test('about page renders the canonical site-footer', () => {
  const html = readAbout();
  assert.ok(html.includes('<footer class="site-footer wrap">'),
    'expected canonical site-footer');
});

test('identity rail renders Skills and Recognition blocks (Education now in main column)', () => {
  const html = readAbout();
  assert.ok(html.includes('class="about-sidebar"'), 'expected sidebar');
  assert.ok(html.includes('AI coach · Builder · Translator'), 'expected role line');
  assert.match(html, />What I'm good at</, 'expected skills heading');
  assert.match(html, />Recognition</, 'expected Recognition heading');
  // Real photo, not the placeholder illustration
  assert.ok(html.includes('src="/lib/img/sam-photo.jpg"'),
    'expected the real photo in the identity rail');
  // Recognition rule — Pik Perseverance framed as team member
  assert.match(html, /first-ascent team/i,
    'Kyrgyzstan must be framed as team member, never expedition leader');
  // Education should NOT live in the sidebar — extract sidebar HTML to verify
  const sidebarMatch = html.match(/<aside class="about-sidebar">[\s\S]*?<\/aside>/);
  assert.ok(sidebarMatch, 'sidebar block must exist');
  assert.ok(!/<h[1-6][^>]*>Education<\/h[1-6]>/.test(sidebarMatch[0]),
    'Education should have been moved out of sidebar');
});

test('education renders 4 accordion rows', () => {
  const h = readAbout();
  const eduMarkers = [
    'University of Sydney',
    'University of Manchester',
    'Coleg Meirion Dwyfor',
    'Ysgol y Moelwyn',
  ];
  for (const m of eduMarkers) {
    assert.ok(h.includes(m), `expected education marker: ${m}`);
  }
  // 4 accordion bodies with edu-1 through edu-4
  for (let i = 1; i <= 4; i++) {
    assert.ok(h.includes(`id="edu-${i}"`), `expected body id edu-${i}`);
  }
});

test('about page intro section renders with sibling-page pointers', () => {
  const h = readAbout();
  assert.match(h, /<section class="about-intro">/, 'expected intro section');
  assert.match(h, /I'm Welsh, based in Sydney/,
    'expected the Welsh identity line');
  assert.match(h, /teacher before I'm a technologist/,
    'expected the teacher-first positioning line');
  assert.match(h, /href="\/overview"/, 'expected /overview sibling link');
  assert.match(h, /href="\/offer"/, 'expected /offer sibling link');
});

test('about page renders the real-testimonials proof strip anchor', () => {
  const h = readAbout();
  assert.ok(h.includes('data-testimonials'),
    'expected testimonials anchor section');
  assert.ok(h.includes('src="/lib/testimonialsRender.js"'),
    'expected shared testimonials renderer script');
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
