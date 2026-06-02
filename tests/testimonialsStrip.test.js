'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testimonialsStripHTML } = require('../lib/testimonialsStrip');
const { testimonials } = require('../lib/testimonials');

// Testimonials is a const reference to a mutable array; both the production
// module and the test see the same array instance. Splice in fixtures per
// test and reset in afterEach. No production-code instrumentation needed.

function setFixtures(items) {
  testimonials.splice(0, testimonials.length, ...items);
}

function reset() {
  testimonials.splice(0, testimonials.length);
}

const validUrl = (n) =>
  `https://www.linkedin.com/posts/client-${n}_activity-${'1'.repeat(15 - String(n).length)}${n}-AbCd`;

test('returns empty string when testimonials is empty', (t) => {
  t.after(reset);
  setFixtures([]);
  assert.strictEqual(testimonialsStripHTML(), '');
});

test('returns empty string with 2 testimonials (below threshold of 3)', (t) => {
  t.after(reset);
  setFixtures([
    { url: validUrl(1), clientName: 'Alex', role: 'Founder', addedDate: '2026-06-01' },
    { url: validUrl(2), clientName: 'Sasha', role: 'Founder', addedDate: '2026-06-01' },
  ]);
  assert.strictEqual(testimonialsStripHTML(), '');
});

test('renders strip with 3 testimonials — 3 iframes + 3 attribution blocks', (t) => {
  t.after(reset);
  setFixtures([
    { url: validUrl(1), clientName: 'Alex Mills', role: 'Founder, Alex Mills Social', addedDate: '2026-06-01' },
    { url: validUrl(2), clientName: 'Sasha Ponomareva', role: 'Founder, Heatwave Accounts', addedDate: '2026-06-01' },
    { url: validUrl(3), clientName: 'Samantha Philpot', role: 'Founder, Find Your People', addedDate: '2026-06-01' },
  ]);
  const html = testimonialsStripHTML();
  assert.match(html, /<section class="testimonials-strip">/);
  assert.match(html, /<h2>What people are saying<\/h2>/);
  const iframeCount = (html.match(/<iframe /g) || []).length;
  assert.strictEqual(iframeCount, 3, 'expected 3 iframes');
  const attributionCount = (html.match(/class="attribution"/g) || []).length;
  assert.strictEqual(attributionCount, 3, 'expected 3 attribution blocks');
  assert.ok(html.includes('Alex Mills'), 'expected Alex Mills name');
  assert.ok(html.includes('Founder, Alex Mills Social'), 'expected role');
});

test('silently filters out testimonials with unparseable URLs', (t) => {
  t.after(reset);
  setFixtures([
    { url: validUrl(1), clientName: 'Alex', role: 'Founder', addedDate: '2026-06-01' },
    { url: 'https://example.com/not-linkedin', clientName: 'Broken', role: 'N/A', addedDate: '2026-06-01' },
    { url: validUrl(3), clientName: 'Sam', role: 'Founder', addedDate: '2026-06-01' },
  ]);
  const html = testimonialsStripHTML();
  const iframeCount = (html.match(/<iframe /g) || []).length;
  assert.strictEqual(iframeCount, 2, 'expected 2 iframes (1 filtered)');
  // Threshold gate (length >= 3) still applies; broken one falls out silently
  // but the strip still renders because we had >= 3 entries.
  assert.match(html, /<section class="testimonials-strip">/);
  assert.ok(!html.includes('"Broken"'), 'broken card should not render an iframe');
});

test('escapes HTML in clientName and role (XSS guard)', (t) => {
  t.after(reset);
  setFixtures([
    {
      url: validUrl(1),
      clientName: '<script>alert("xss")</script>',
      role: 'Founder & "CEO" <Acme>',
      addedDate: '2026-06-01',
    },
    { url: validUrl(2), clientName: 'Sasha', role: 'Founder', addedDate: '2026-06-01' },
    { url: validUrl(3), clientName: 'Sam', role: 'Founder', addedDate: '2026-06-01' },
  ]);
  const html = testimonialsStripHTML();
  assert.ok(!html.includes('<script>alert'),
    'raw <script> tag must not appear in output');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'),
    'expected escaped script tag');
  assert.ok(html.includes('Founder &amp; &quot;CEO&quot; &lt;Acme&gt;'),
    'expected escaped role');
});
