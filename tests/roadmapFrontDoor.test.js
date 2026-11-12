// tests/roadmapFrontDoor.test.js - the AI roadmap is the front door (bd
// session, 21 Oct 2026): /roadmap is its short URL, /book and /offer list it
// first, and its page describes it as it runs. It stays listed at A$250 with
// Stripe checkout and the code field, because partners give it free by code.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('/roadmap redirects to the booking page (Vercel carries ?code= and utm tags across)', () => {
  const cfg = JSON.parse(read('vercel.json'));
  const r = cfg.redirects.find((x) => x.source === '/roadmap');
  assert.ok(r, '/roadmap redirect exists');
  assert.strictEqual(r.destination, '/book/roadmap');
  assert.ok(!r.destination.includes('?'), 'no query on the destination, so the incoming query string passes through untouched');
});

test('/book/roadmap describes the roadmap as it runs, and stays paid with a code field', () => {
  const html = read('book/roadmap.html');
  assert.match(html, /<h1>AI roadmap<\/h1>/);
  // As it runs, in three steps (layout v5, 3 Nov 2026): call, report, call.
  assert.match(html, /<h2>Call one, 30 minutes<\/h2><p>We go through all the pain points in your business and get properly into the weeds\./);
  assert.match(html, /<h2>The report, within 3 business days<\/h2><p>Where AI could help and what I'd start with/);
  assert.match(html, /<h2>Call two, 30 minutes<\/h2><p>We go through it together\./);
  assert.match(html, /<li>A\$250<\/li>/);
  assert.match(html, /<li>Up to 10 a week<\/li>/);
  assert.ok(!/one specific problem|two or three ways/i.test(html), 'the one-problem framing is gone');
  assert.match(html, /window\.SKU_SLUG='roadmap';window\.IS_PAID=true;/, 'still goes through Stripe checkout');
  assert.match(read('book/_slot-picker.js'), /Discount code \(optional\)/, 'the code field is still on paid booking forms');
});

test('/book is retired: it redirects to /offer, the one page that lists every offer (Sam, 12 Nov 2026)', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'book', 'index.html')), 'book/index.html is archived, not served');
  const cfg = JSON.parse(read('vercel.json'));
  assert.ok(cfg.redirects.some((r) => r.source === '/book' && r.destination === '/offer'));
});

test('/offer: roadmap, walkthrough, guided setup, by the hour; nothing about retired offers', () => {
  const html = read('offer/index.html');
  const order = ['data-sku="roadmap"', 'data-sku="walkthrough"', 'data-sku="guided-setup"', 'A$300 an hour</strong>']
    .map((s) => html.indexOf(s));
  assert.ok(order.every((i) => i > -1), `an offer is missing: ${order}`);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order);
  assert.ok(!/What is no longer offered/.test(html));
  assert.ok(!/href="\/book\/discovery"/.test(html), 'the discovery call is off the site (3 Nov 2026)');
  assert.ok(!/one specific problem|two or three ways/i.test(html));
});
