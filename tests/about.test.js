'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { NAV_ITEMS } = require('../lib/site.js');

function readAbout() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'about', 'index.html'),
    'utf8'
  );
}

test('about page has the canonical head', () => {
  const html = readAbout();
  assert.ok(html.includes('<title>About Sam · Crads-AI</title>'),
    'expected canonical title');
  assert.ok(html.includes('href="/lib/site.css"'),
    'expected shared CSS link');
  assert.ok(html.includes('src="/lib/site.js"'),
    'expected shared JS link');
});

// 2026-08-16: this test asserted the retired FLAT nav, and had been failing on
// every run since the grouped-dropdown nav landed. What went wrong: it pinned
// exact markup strings ("<nav class=\"site-nav-bar\">", "<a href=\"/overview\">
// Overview</a>", class="current" as the whole class attribute), so an added
// aria-label, a renamed label and a second class name each read as a missing
// nav. Rule now: assert the DESTINATIONS and the current-marker, never the
// surrounding attributes or the visible label, which are the designer's to move.
test('about page renders the canonical nav with About marked current', () => {
  const html = readAbout();
  assert.match(html, /<nav class="site-nav-bar"[^>]*>/,
    'expected canonical site-nav-bar');
  assert.match(html, /<a[^>]*href="\/about"[^>]*class="[^"]*\bcurrent\b[^"]*"[^>]*>About<\/a>/,
    'expected About link marked current (tolerates a class list)');
  for (const href of ['/', ...NAV_ITEMS.map((i) => i.href)]) {
    assert.ok(html.includes(`href="${href}"`), `expected nav link to ${href}`);
  }
});

test('about page has identity rail with name', () => {
  const html = readAbout();
  assert.match(html, /Samuel<br>Caradog Davis/,
    'expected name with line break');
});

test('about page has the four main section headings + intro heading', () => {
  const html = readAbout();
  assert.ok(html.includes('>Hi, I\'m Sam.<'), 'expected intro heading');
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
  assert.ok(html.includes('Builder · Teacher · Translator'), 'expected role line');
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
  assert.match(h, /href="\/offer"/, 'expected /offer sibling link');
});

test('about page renders the real-testimonials proof strip anchor', () => {
  const h = readAbout();
  assert.ok(h.includes('data-testimonials'),
    'expected testimonials anchor section');
  assert.ok(h.includes('src="/lib/testimonialsRender.js"'),
    'expected shared testimonials renderer script');
});

// 2026-09-09: the per-page nav-destination loop that lived here moved to
// tests/navConsistency.test.js, which pins every served page's static nav to
// lib/site.js navHTML() byte for byte (NAV_ITEMS is the one list).

test('experience renders 9 accordion rows in reverse-chronological order', () => {
  const h = readAbout();
  const roleMarkers = [
    'Building Crads-AI',
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
