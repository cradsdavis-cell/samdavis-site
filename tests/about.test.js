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
  for (const href of ['/', '/overview', '/offer', '/book']) {
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

// 2026-08-16: was "About between Overview and Offer", which described the
// retired flat nav. In the grouped nav /overview sits in the System menu and
// /about is a top-level link AFTER /offer, so the ordering assertion could
// never pass again, and four book/ pages still carry the old flat nav, so no
// single ordering is true site-wide. What it was really protecting is that no
// page silently loses a nav destination. That is what it asserts now, plus the
// grouping where the grouped nav is present.
test('every nav-bearing page keeps all four nav destinations', () => {
  for (const rel of NAV_PAGES) {
    const fp = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(fp, 'utf8');
    for (const href of ['/overview', '/about', '/how-it-works', '/offer']) {
      assert.ok(src.includes(`<a href="${href}"`), `${rel}: missing ${href} link`);
    }
    // Grouped nav only: /overview belongs to the System menu, /how-it-works and
    // /offer to the Coaching menu. The legacy flat nav (book/*) has no groups.
    const coaching = src.match(/<div class="nav-group"[^>]*data-group="coaching"[^>]*>[\s\S]*?<\/div>\s*<\/div>/);
    if (!coaching) continue;
    const system = src.match(/<div class="nav-group"[^>]*data-group="system"[^>]*>[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(system && system[0].includes('/overview'),
      `${rel}: /overview must sit in the System group`);
    assert.ok(coaching[0].includes('/how-it-works') && coaching[0].includes('/offer'),
      `${rel}: /how-it-works and /offer must sit in the Coaching group`);
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
