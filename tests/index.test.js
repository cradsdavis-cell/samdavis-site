// tests/index.test.js - the front door is product-first (v4, 2026-09-09):
// the product, its screenshots and the download come before anything about
// Sam or his time. Assert destinations and headings, never markup detail.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('front door names the product, not the coaching', () => {
  assert.ok(html.includes('<title>Crads-AI · A free, self-hosted AI assistant that knows you</title>'), 'title');
  assert.match(html, /<h1>An AI assistant on your own server that /, 'h1 leads with the product');
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.ok(!/coach/i.test(desc), 'no coaching framing in the description');
  assert.ok(html.includes('<meta property="og:site_name" content="Crads-AI">'), 'og:site_name is the product');
});

test('hero CTAs are Download and the first hour', () => {
  const hero = html.slice(html.indexOf('<section class="hero'), html.indexOf('</section>', html.indexOf('<section class="hero')));
  assert.match(hero, /class="cta-primary" href="\/download"/, 'primary CTA downloads');
  assert.match(hero, /href="\/docs\/first-hour"/, 'secondary CTA reads the docs');
  assert.ok(hero.includes('/lib/img/shots/overview.png'), 'the hero shows the product');
  assert.match(hero, /href="https:\/\/github\.com\/cradsdavis-cell\/crads-ai"/, 'open source links to the public repository (flipped 2026-09-09)');
});

test('the product sections exist in order: inside, get-it, free, then the offer', () => {
  const order = ['id="film"', 'id="the-wave"', 'id="capabilities"', 'id="inside"', 'id="get-it"', 'id="free"', 'id="who"', 'id="how"', 'id="work"', 'id="final-cta"']
    .map((id) => html.indexOf(id));
  assert.ok(order.every((i) => i > -1), `a section is missing: ${order}`);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'sections out of order');
});

test('annotated screenshots carry numbered marks and a legend', () => {
  const figures = html.match(/<figure class="shot-figure[\s\S]*?<\/figure>/g) || [];
  assert.ok(figures.length >= 2, `expected at least two annotated figures, got ${figures.length}`);
  for (const f of figures) {
    const marks = (f.match(/class="shot-mark"/g) || []).length;
    const legend = (f.match(/<li>/g) || []).length;
    assert.ok(marks >= 2 && marks === legend, `marks (${marks}) and legend items (${legend}) must agree`);
    assert.match(f, /src="\/lib\/img\/shots\/[a-z-]+\.png"/, 'marketing shots live in lib/img/shots');
  }
});

test('structured data describes the free software application', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
  assert.ok(app, 'SoftwareApplication block');
  assert.strictEqual(app.name, 'Crads-AI');
  assert.strictEqual(app.offers.price, '0');
  assert.strictEqual(app.isAccessibleForFree, true);
  assert.ok(blocks.find((b) => b['@type'] === 'Person'), 'Person block kept');
});

test('the offer on the front door is v5 and nothing ongoing', () => {
  assert.match(html, /href="\/book\/walkthrough"/);
  assert.match(html, /href="\/book\/guided-setup"/);
  assert.ok(!/book\/working-session/.test(html), 'the working session is retired');
  assert.match(html, /A\$233 an hour/);
  assert.match(html, /on your own by design/);
  assert.match(html, /on your own computer/);
  assert.match(html, /You won't write code\. You will open a terminal once/);
  assert.ok(!/four sessions|4 sessions|retainer/i.test(html), 'no session arc or retainer copy');
});
