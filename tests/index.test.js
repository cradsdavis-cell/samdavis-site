// tests/index.test.js - the front door sells the AI roadmap to small-business
// owners (bd session, 21 Oct 2026; supersedes the product-first v4 page of
// 2026-09-09): six sections, one button, prices shown, the free software in
// the nav and one closing line. Assert destinations and headings, never
// markup detail.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));

function section(id) {
  const start = main.indexOf(`id="${id}"`);
  assert.ok(start > -1, `section #${id} is missing`);
  return main.slice(start, main.indexOf('</section>', start));
}

test('the head names the new headline and the roadmap', () => {
  assert.ok(html.includes('<title>Make Claude know your business · Crads-AI</title>'), 'title');
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.match(desc, /AI roadmap/);
  assert.ok(!/coach/i.test(desc), 'no coaching framing in the description');
  assert.ok(html.includes('<meta property="og:site_name" content="Crads-AI">'));
  assert.ok(html.includes('<link rel="canonical" href="https://crads-ai.com/">'));
});

test('the hero has the headline and one button: book an AI roadmap', () => {
  const hero = section('top');
  assert.match(hero, /<h1>Make Claude know <em>your business\.<\/em><\/h1>/);
  assert.match(hero, /On a 30-min call we go through all the pain points in your business/);
  const ctas = hero.match(/class="cta-primary"[^>]*>[^<]*</g) || [];
  assert.deepStrictEqual(ctas, ['class="cta-primary" href="/book/roadmap">Book an AI roadmap<'], 'exactly one hero button');
  assert.match(hero, /A\$250 · up to 10 a week\./);
  assert.ok(!/href="\/download"/.test(hero), 'the download is not a hero button any more');
});

test('six sections, in the order of the draft', () => {
  const order = ['id="top"', 'id="doors"', 'id="how"', 'id="onboarded"', 'id="questions"', 'id="who"'].map((id) => main.indexOf(id));
  assert.ok(order.every((i) => i > -1), `a section is missing: ${order}`);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'sections out of order');
  assert.strictEqual((main.match(/<section\b/g) || []).length, 6, 'six sections, no more');
});

test('the three doors: clients, out of your head, showing up', () => {
  const doors = section('doors');
  assert.match(doors, /Where most people start/);
  const names = [...doors.matchAll(/<div class="big">([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['More of the right clients.', 'Everything out of your head.', 'Showing up every week.']);
  for (const g of ['/guides/claude-remember-your-business', '/guides/ai-proposals-and-quotes', '/guides/ai-social-media-posts']) {
    assert.ok(doors.includes(`href="${g}"`), `door links ${g}`);
  }
  const clients = doors.slice(doors.indexOf('id="door-clients"'), doors.indexOf('id="door-head"'));
  assert.ok(!/<a\b/.test(clients), 'the clients door has no guide yet, so no link');
});

test('how the roadmap runs, then the price strip', () => {
  const how = section('how');
  assert.match(how, /Two calls and a report/);
  assert.strictEqual((how.match(/<li>/g) || []).length, 3, 'three steps');
  assert.match(how, /within three working days/);
  for (const price of ['AI roadmap A$250', 'Walkthrough A$350', 'Guided setup A$700', 'A$233 an hour']) {
    assert.ok(how.includes(price), `price strip shows ${price}`);
  }
  assert.match(how, /href="\/offer"/, 'the strip links the full offer');
});

test('the mechanism keeps the traced claims', () => {
  const m = section('onboarded');
  assert.match(m, /Claude, <em>onboarded to you\.<\/em>/);
  assert.match(m, /drafts only, if that's what you want/);
  assert.match(m, /from about €6 a month, billed by the host/);
  assert.match(m, /The software is free and open source\./);
});

test('the questions carry the one discovery-call link', () => {
  const q = section('questions');
  assert.strictEqual((q.match(/<h3>/g) || []).length, 5, 'five questions');
  assert.match(q, /<a href="\/book\/discovery">Book a free 30-minute call<\/a>/);
  assert.strictEqual((main.match(/href="\/book\/discovery"/g) || []).length, 1, 'discovery is one text link, never a button');
  assert.match(q, /href="\/docs\/continuity"/);
});

test('the close: who you would work with, the button again, then do it yourself', () => {
  const who = section('who');
  assert.match(who, /PhD in environmental data science from the University of Sydney/);
  assert.match(who, /seven AI systems in twelve months/);
  assert.match(who, /href="\/about"/);
  assert.match(who, /class="cta-primary" href="\/book\/roadmap">Book an AI roadmap</);
  assert.match(who, /Prefer to do it yourself\?/);
  assert.match(who, /href="\/download"/);
  assert.match(who, /href="\/docs\/first-hour"/);
});

test('every button on the page books the roadmap', () => {
  const buttons = [...main.matchAll(/class="cta-primary" href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(buttons.length >= 2);
  for (const b of buttons) assert.strictEqual(b, '/book/roadmap');
});

test('structured data: the roadmap service, the free software and Sam', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const svc = blocks.find((b) => b['@type'] === 'Service');
  assert.ok(svc, 'Service block');
  assert.strictEqual(svc.offers.price, '250');
  assert.strictEqual(svc.offers.priceCurrency, 'AUD');
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
  assert.ok(app && app.isAccessibleForFree === true && app.offers.price === '0', 'the software is still free');
  assert.ok(blocks.find((b) => b['@type'] === 'Person'), 'Person block kept');
});

test('nothing retired comes back', () => {
  assert.ok(!/book\/working-session/.test(html), 'the working session is retired');
  assert.ok(!/on your own computer|Same price either way/.test(html), 'local mode is retired (13 Oct 2026)');
  assert.ok(!/four sessions|4 sessions|retainer/i.test(html), 'no session arc or retainer copy');
  assert.ok(!/one specific problem|two or three ways/i.test(html), 'the roadmap is no longer one specific problem');
});
