// tests/index.test.js - the front door sells the AI roadmap to small-business
// owners (bd session, 21 Oct 2026; supersedes the product-first v4 page of
// 2026-09-09): six sections, one button, prices shown, the free software in
// the nav and one closing line. Second pass 22 Oct 2026: clients first, proof
// in, the mechanism folded into the questions. Assert destinations and
// headings, never markup detail.
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
  assert.ok(html.includes('<title>Claude on steroids, but authentically you · Crads-AI</title>'), 'title (Sam, 3 Nov 2026)');
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.match(desc, /AI roadmap/);
  assert.ok(!/coach/i.test(desc), 'no coaching framing in the description');
  assert.ok(html.includes('<meta property="og:site_name" content="Crads-AI">'));
  assert.ok(html.includes('<link rel="canonical" href="https://crads-ai.com/">'));
});

test('the hero calls out the owner, carries Sam\'s headline and subline, and has one button', () => {
  const hero = section('top');
  assert.match(hero, /For owners of small consultancies and practices/);
  // Sam's own words, chosen 3 Nov 2026 over the outcome-led option.
  assert.match(hero, /<h1>Claude on steroids, <em>but authentically you\.<\/em><\/h1>/);
  assert.match(hero, /<p class="hero-sub">Make Claude know you and your business\.<\/p>/);
  // Sam, 4 Nov 2026 ("A"): the old mechanism line "doesn't really make sense and sounds too AI".
  // "Almost every", not a count: the latest ten aren't all tallied for prior AI use (9 of the first 10 were).
  assert.match(hero, /Almost every owner I've done a roadmap with already used AI, spread across chats that don't share what they know\./);
  assert.match(hero, /I set Claude up once so it knows your clients and how you write\./);
  // The roadmap as it runs: everything that's slow or stuck, then the report (the second call is in the steps below).
  assert.match(hero, /The first step is a roadmap: a call on everything that's slow or stuck in your business, then a written report on where AI could help\./);
  assert.ok(!/pick one thing/i.test(hero), 'never "pick one thing" (public-copy-claims)');
  // Sam, 3 Nov 2026: the presenting photo, its screen showing the Crads-AI title slide (his call).
  assert.match(hero, /<img src="\/lib\/img\/sam-presenting-crads\.jpg"/, 'Sam presenting, not the app');
  const ctas = hero.match(/class="cta-primary"[^>]*>[^<]*</g) || [];
  assert.deepStrictEqual(ctas, ['class="cta-primary" href="/book/roadmap">Book an AI roadmap<'], 'exactly one hero button');
  assert.match(hero, /A\$250 · up to 10 a week\./);
  assert.ok(!/href="\/download"/.test(hero), 'the download is not a hero button');
});

// Second pass (22 Oct 2026): the mechanism moved into the first question and
// proof took its place. 3 Nov 2026: proof moves above the doors, for a reader
// who doesn't know Sam yet. Still six sections.
test('six sections, in order', () => {
  const order = ['id="top"', 'id="proof"', 'id="doors"', 'id="how"', 'id="questions"', 'id="who"'].map((id) => main.indexOf(id));
  assert.ok(order.every((i) => i > -1), `a section is missing: ${order}`);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'sections out of order');
  assert.strictEqual((main.match(/<section\b/g) || []).length, 6, 'six sections, no more');
});

test('the three doors: clients first, with the roadmap count behind it', () => {
  const doors = section('doors');
  // Sam, 4 Nov 2026: the heading says what the cards are (the want, then what it does).
  assert.match(doors, /What owners asked for in my last ten roadmaps, and what it does about each/);
  const names = [...doors.matchAll(/<div class="big">([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['More of the right clients.', 'Everything out of your head.', 'Showing up every week.']);
  const clients = doors.slice(doors.indexOf('id="door-clients"'), doors.indexOf('id="door-head"'));
  // Re-tallied 3 Nov 2026 on the latest ten roadmaps (8 to 26 Oct), strict count.
  assert.match(clients, /The first thing 6 of 10 asked for\./);
  assert.match(clients, /You approve every one\./);
  assert.ok(!/<a\b/.test(clients), 'the clients door has no guide yet, so no link');
  for (const g of ['/guides/claude-remember-your-business', '/guides/ai-social-media-posts']) {
    assert.ok(doors.includes(`href="${g}"`), `door links ${g}`);
  }
});

test('proof: real, named, consented quotes only, plus a marked slot', () => {
  const proof = section('proof');
  const names = [...proof.matchAll(/<span class="t-name">([^<]*)<\/span>/g)].map((m) => m[1]);
  // Sam, 4 Nov 2026: more quotes, in a slow carousel, all public with consent
  // (Abbey and Nim: "Yes, with my name"; Alex and Samantha: the published set in
  // lib/testimonialsRender.js). Sam, 12 Nov 2026: every testimonial is listed, so
  // the two anonymous quotes from the published set join them.
  assert.deepStrictEqual(names, ['Abbey Pantano', 'Nim Zappert', 'Alex Mills', 'Samantha Philpot', 'Anonymous client', 'Anonymous client']);
  // Both quotes must match the consented source in lib/testimonialsRender.js or
  // the 23 Sep homepage (PR #38): no paraphrase.
  assert.match(proof, /lift the mental load of juggling all the moving parts of my business when I'm the only person working on it full time\./);
  const render = fs.readFileSync(path.join(__dirname, '..', 'lib', 'testimonialsRender.js'), 'utf8');
  const nim = proof.match(/<blockquote>(The fact that[^<]*)<\/blockquote>/)[1].replace(/\.$/, '');
  assert.ok(render.includes(nim), 'Nim\'s words are a verbatim excerpt of her published quote');
  for (const q of proof.matchAll(/<blockquote>((?:I came in|After my first|It means I can|The concept of)[^<]*)<\/blockquote>/g)) {
    assert.ok(render.includes(q[1]), 'verbatim from the published set: ' + q[1].slice(0, 30));
  }
  assert.match(proof, /SLOT \(client testimonial, door 1\)/, 'the slot for a clients-door testimonial is marked');
});

test('proof carousel: moves slowly, can be paused, stays still for reduced motion', () => {
  const proof = section('proof');
  assert.match(proof, /<div class="t-carousel" data-carousel>/);
  assert.match(proof, /<button class="t-carousel-toggle" type="button" aria-pressed="false" hidden>Pause<\/button>/, 'a pause control (WCAG 2.2.2), shown by JS');
  const css = fs.readFileSync(path.join(__dirname, '..', 'lib', 'site.css'), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.t-carousel\.is-moving \.t-track \{ animation: none; \}/);
  assert.match(css, /\.t-carousel\.is-moving:hover \.t-track,/, 'pauses on hover');
  const js = fs.readFileSync(path.join(__dirname, '..', 'lib', 'site.js'), 'utf8');
  assert.match(js, /prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(js, /copy\.setAttribute\('aria-hidden', 'true'\)/, 'clones are hidden from screen readers');
});

test('how the roadmap runs, then the price strip', () => {
  const how = section('how');
  assert.match(how, /Two calls and a report/);
  assert.strictEqual((how.match(/<li>/g) || []).length, 3, 'three steps');
  assert.match(how, /within three working days/);
  for (const price of ['AI roadmap A$250', 'Walkthrough A$350', 'Guided setup A$700', 'then <a href="/membership">membership</a>, A$99 a month']) {
    assert.ok(how.includes(price), `price strip shows ${price}`);
  }
  assert.match(how, /href="\/offer"/, 'the strip links the full offer');
});

test('the questions carry the mechanism and the traced claims', () => {
  const q = section('questions');
  assert.strictEqual((q.match(/<h3>/g) || []).length, 6, 'six questions');
  // Where the data goes, in the safe wording (public-copy-claims: never "your data stays with you").
  assert.match(q, /What you type goes to Claude, on Anthropic's servers\. I never hold it\./);
  assert.ok(!/data stays with you/i.test(q));
  // 3 of 10 roadmap owners feared it would sound like AI; the honest answer (docs/teach-it-your-voice).
  assert.match(q, /<h3>Will it sound like AI\?<\/h3>\s*<p>At first, a bit\./);
  assert.match(q, /Nothing goes out until you've read it and said yes\./);
  // Sam, 4 Nov 2026: no "a chat that forgets you" (both ChatGPT and Claude have memory) and no repeat of the hero.
  assert.match(q, /So did almost everyone I've done a roadmap with\. Set up once, it knows your clients, your work and how you write/);
  assert.ok(!/forgets you/.test(q));
  assert.match(q, /on limits you choose/);
  assert.match(q, /from about €6 a month/);
  assert.match(q, /href="\/docs\/continuity"/);
});

test('the close: who you would work with, the button again, and do it yourself', () => {
  const who = section('who');
  assert.match(who, /PhD in environmental data science from the University of Sydney/);
  // Sam, 3 Nov 2026: drop the number (three of the "seven" were specced, not built).
  assert.match(who, /I build AI systems for clients and for myself, including the assistant that runs my own week/);
  assert.ok(!/seven AI systems/.test(who), 'no build count');
  assert.match(who, /I run every roadmap call myself/);
  assert.match(who, /src="\/lib\/img\/sam-photo\.jpg"/, 'Sam\'s own headshot stays in the bio (Sam, 3 Nov 2026)');
  assert.match(who, /href="\/about"/);
  assert.match(who, /class="cta-primary" href="\/book\/roadmap">Book an AI roadmap</);
  assert.ok(!/href="\/book\/discovery"/.test(main), 'the discovery call is off the site (Sam, 3 Nov 2026); the roadmap is the one front door');
  assert.match(who, /href="\/download"/);
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
