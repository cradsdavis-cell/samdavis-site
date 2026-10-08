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
  assert.ok(html.includes('<title>About Dr Sam Davis · Crads-AI</title>'),
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

test('about page has identity rail with name and title', () => {
  const html = readAbout();
  assert.match(html, /<h1>Dr Sam Davis<\/h1>/, 'expected Dr Sam Davis as the h1');
  assert.ok(html.includes('Samuel Caradog Davis'), 'expected full name in the rail');
});

test('about page has the four main section headings + intro heading', () => {
  const html = readAbout();
  assert.ok(html.includes('>Hi, I\'m Sam.<'), 'expected intro heading');
  assert.ok(html.includes('>Experience<'), 'expected Experience heading');
  assert.match(html, /<h2[^>]*>Education</, 'expected Education H2 heading');
  assert.ok(html.includes('>Outside work<'), 'expected Outside work heading');
  assert.match(html, /<h2[^>]*>Things I've built</, 'expected builds H2 heading');
  assert.ok(html.includes(">Every job I've had has been the same job<"), 'expected the proof section');
  assert.ok(html.includes('>You can check my work<'), 'expected the open-source / pricing section');
});

test('about page renders the canonical site-footer', () => {
  const html = readAbout();
  assert.ok(html.includes('<footer class="site-footer wrap">'),
    'expected canonical site-footer');
});

// 2026-10-08: the rail swapped self-labels (skills pills, Recognition) for
// checkable facts, so a stranger can verify who Sam is in ten seconds.
test('identity rail renders the At a glance facts (Education now in main column)', () => {
  const html = readAbout();
  assert.ok(html.includes('class="about-sidebar"'), 'expected sidebar');
  assert.match(html, />At a glance</, 'expected At a glance heading');
  for (const fact of ['PhD · University of Sydney', 'European Space Agency', 'Alan Turing Institute', 'Seven paying clients']) {
    assert.ok(html.includes(fact), `expected rail fact: ${fact}`);
  }
  // Real photo, not the placeholder illustration
  assert.ok(html.includes('src="/lib/img/sam-photo.jpg"'),
    'expected the real photo in the identity rail');
  // Recognition rule — Pik Perseverance framed as team member
  assert.match(html, /part of the British Alpine Club team that made the first ascent/i,
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
  assert.match(h, /I'm Welsh \(Caradog is my middle name\)/,
    'expected the Welsh identity line');
  assert.match(h, /taking something technical and making it work for the people in the room/,
    'expected the throughline');
  assert.match(h, /href="\/offer"/, 'expected /offer sibling link');
  assert.match(h, /href="\/how-it-works"/, 'expected /how-it-works sibling link');
});

test('the proof strip sits straight after the intro, and the CTA goes to the roadmap', () => {
  const h = readAbout();
  const intro = h.indexOf('</section>', h.indexOf('class="about-intro"'));
  const strip = h.indexOf('data-testimonials');
  const experience = h.indexOf('>Experience<');
  assert.ok(intro < strip && strip < experience, 'testimonials must come right after the intro');
  assert.ok(!h.includes('/book/discovery'), 'About books the roadmap, not discovery');
  assert.ok(h.includes('href="/book/roadmap"'), 'expected roadmap CTA');
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

// 2026-10-08 (Sam): shipped builds get rows; concepts are named in one line
// underneath, and the page carries no headline build count.
test('builds lists shipped work as rows and concepts as one line', () => {
  const h = readAbout();
  const builds = [
    'Crads-AI',
    'My own assistant',
    'Carbon Tracker',
    'Derwen',
    'River mesh generator',
    'Earlier ideas I specced but didn\'t build',
    'TrailMate',
  ];
  assert.ok(!/7 builds|7 in 12 months/.test(h), 'no headline build count');
  for (const b of builds) {
    assert.ok(h.includes(b), `expected build: ${b}`);
  }
});
