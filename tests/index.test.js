// tests/index.test.js - the front door sells the AI roadmap to small-business
// owners (bd session, 21 Oct 2026; supersedes the product-first v4 page of
// 2026-09-09): six sections, one button, prices shown, the free software in
// the nav and one closing line. Second pass 22 Oct 2026: clients first, proof
// in, the mechanism folded into the questions. Assert destinations and
// headings, never markup detail.
// 19 Nov 2026 (Sam, after Alina Iurina's "offer and audience unclear"): the
// reader is purpose-led businesses, charities and NFPs included; the headline
// is "Your AI brain, built for you."; a "Conscious AI, in practice" block of
// three commitments follows the proof; Done for you leads the price strip with
// guided setup as the smaller option; the free software is one quiet line.
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
  assert.ok(html.includes('<title>Your AI brain, built for you · Crads-AI</title>'), 'title (Sam, 19 Nov 2026)');
  assert.ok(!/steroids/.test(html.slice(0, html.indexOf('<main>'))), 'the 3 Nov headline is gone from the head');
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.match(desc, /AI roadmap/);
  assert.ok(!/coach/i.test(desc), 'no coaching framing in the description');
  assert.ok(html.includes('<meta property="og:site_name" content="Crads-AI">'));
  assert.ok(html.includes('<link rel="canonical" href="https://crads-ai.com/">'));
});

test('the hero calls out the reader, carries Sam\'s headline and subline, and has one button', () => {
  const hero = section('top');
  // Sam, 19 Nov 2026: "purpose-led businesses (charities and NFPs included)", never "small businesses and charities".
  assert.match(hero, /<p class="eyebrow">For purpose-led businesses, charities and NFPs included<\/p>/);
  // Alina Iurina's "AI brain built for you" (17 Nov call), Sam's pick of option A on 19 Nov 2026.
  assert.match(hero, /<h1>Your AI brain, <em>built for you\.<\/em><\/h1>/);
  // Claude stays named above the fold. Sam, 19 Nov 2026: the capability is problem solving, not just writing.
  assert.match(hero, /<p class="hero-sub">Claude, set up to know your business, so you can point it at your hardest problems\.<\/p>/);
  // Sam, 4 Nov 2026 ("A"): the old mechanism line "doesn't really make sense and sounds too AI".
  // "Almost every", not a count: the latest ten aren't all tallied for prior AI use (9 of the first 10 were).
  assert.match(hero, /Almost everyone I've done a roadmap with already used AI, spread across chats that don't share what they know\./);
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
// who doesn't know Sam yet. 19 Nov 2026: the commitments block follows the
// proof, and an anonymous "what one owner built" follows it, so eight sections.
test('eight sections, in order', () => {
  const order = ['id="top"', 'id="proof"', 'id="conscious"', 'id="built"', 'id="doors"', 'id="how"', 'id="questions"', 'id="who"'].map((id) => main.indexOf(id));
  assert.ok(order.every((i) => i > -1), `a section is missing: ${order}`);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'sections out of order');
  assert.strictEqual((main.match(/<section\b/g) || []).length, 8, 'eight sections, no more');
});

test('what one owner built: anonymous, facts only, no hours-saved figure', () => {
  const b = section('built');
  assert.match(b, /What one owner built on it <em>in under a month\.<\/em>/);
  const items = [...b.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
  assert.strictEqual(items.length, 5);
  // Sam, 19 Nov 2026: "keep people anonymous". No names, no business or site names, no quotes.
  assert.ok(!/\bAri\b|Nikolopoulos|Omni Energy|cheaperbusinessenergy/.test(b) && !/<blockquote/.test(b), 'anonymous');
  assert.ok(!/hours/i.test(b), 'no unverified time-saved figure');
});

test('conscious AI, in practice: the three commitments, in the safe data wording', () => {
  const c = section('conscious');
  assert.match(c, /Three rules <em>I work by\.<\/em>/, 'Sam, 23 Nov 2026: was "Conscious AI, in practice."');
  const heads = [...c.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);
  assert.deepStrictEqual(heads, [
    'I never hold your data.',
    'AI before you hire, never instead of hiring.',
    'You sign off everything that goes out in your name.',
  ]);
  // public-copy-claims: never "your data stays with you"; what you type goes to Claude.
  assert.match(c, /What you type goes to Claude, on Anthropic's servers\./);
  assert.ok(!/data stays with you|stays local|never leaves/i.test(c));
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
  // the two anonymous quotes from the published set join them. Sam, 23 Nov 2026:
  // the two anonymous quotes are held back (readers discounted the named ones).
  // Sam, 24 Nov 2026: Aarti Soni joins (her name and text approved by email).
  assert.deepStrictEqual(names, ['Abbey Pantano', 'Nim Zappert', 'Alex Mills', 'Samantha Philpot', 'Aarti Soni']);
  // Both quotes must match the consented source in lib/testimonialsRender.js or
  // the 23 Sep homepage (PR #38): no paraphrase.
  assert.match(proof, /lift the mental load of juggling all the moving parts of my business when I'm the only person working on it full time\./);
  const render = fs.readFileSync(path.join(__dirname, '..', 'lib', 'testimonialsRender.js'), 'utf8');
  const nim = proof.match(/<blockquote>(The fact that[^<]*)<\/blockquote>/)[1].replace(/\.$/, '');
  assert.ok(render.includes(nim), 'Nim\'s words are a verbatim excerpt of her published quote');
  for (const q of proof.matchAll(/<blockquote>((?:I came in|After my first|It means I can|The concept of|Our AI assistant)[^<]*)<\/blockquote>/g)) {
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

// Sam, 25 Nov 2026: "list Tap4Change and Pitch Club as partners on my website.
// Include their logos". Under the quotes, inside the proof section (still eight
// sections). Partner booking codes are private, so none appears on the page.
test('partners: Tap4Change and Pitch Club, local logos, linked to their own sites, no codes', () => {
  const proof = section('proof');
  const p = proof.slice(proof.indexOf('id="partners"'));
  assert.ok(proof.indexOf('id="partners"') > proof.indexOf('t-carousel-toggle'), 'partners sit under the quotes');
  const alts = [...p.matchAll(/<img [^>]*alt="([^"]*)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(alts, ['Tap4Change', 'The Pitch Club']);
  assert.match(p, /href="https:\/\/tap4change\.org\/brands\/crads-ai"/);
  assert.match(p, /href="https:\/\/pitchclub\.au\/"/);
  for (const m of p.matchAll(/src="(\/lib\/img\/partners\/[a-z0-9-]+\.(?:svg|png))"/g)) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', m[1])), m[1]);
    if (m[1].endsWith('.svg')) {
      assert.ok(!/<script|on[a-z]+=/i.test(fs.readFileSync(path.join(__dirname, '..', m[1]), 'utf8')), 'no script in ' + m[1]);
    }
  }
  assert.ok(!/PITCHCLUB|TAP4ROADMAP|TAP4NEWS/.test(html), 'no partner booking code on the public page');
  assert.ok(!p.includes('—'), 'no em dashes');
});

test('how the roadmap runs, then the price strip', () => {
  const how = section('how');
  assert.match(how, /Two calls and a report/);
  assert.strictEqual((how.match(/<li>/g) || []).length, 3, 'three steps');
  assert.match(how, /within three working days/);
  // Sam, 19 Nov 2026: Done for you leads, guided setup is the smaller option;
  // walkthrough, bespoke and membership live on /offer.
  assert.match(how, /<a href="\/book\/done-for-you"><strong>Done for you, A\$1,500\.<\/strong><\/a> Built and working\. Your part: one form, two calls\./);
  assert.match(how, /Rather set it up together\? <a href="\/book\/guided-setup">Guided setup, A\$700<\/a>\./);
  assert.ok(how.indexOf('Done for you, A$1,500') < how.indexOf('Guided setup, A$700'), 'Done for you first');
  assert.ok(!/Walkthrough A\$350|Bespoke/.test(how), 'walkthrough and bespoke stay on /offer');
  assert.match(how, /href="\/offer"/, 'the strip links the full offer');
  // 16 Nov 2026 ruling: charities pay through grant-ready work, no discount.
  assert.match(how, /Charity or NFP\? Tell me on the first call, and I'll write the report to go straight into a capacity-building grant application\./);
  assert.ok(!/discount/i.test(how), 'no charity discount');
});

test('the questions carry the mechanism and the traced claims', () => {
  const q = section('questions');
  assert.strictEqual((q.match(/<h3>/g) || []).length, 6, 'six questions');
  // Where the data goes, in the safe wording (public-copy-claims: never "your data stays with you").
  assert.match(q, /What you type goes to Claude, on Anthropic's servers, under <a href="https:\/\/www\.anthropic\.com\/legal\/privacy"[^>]*>Anthropic's privacy policy<\/a>\. I never hold it\./, 'Sam, 23 Nov 2026: link Anthropic\'s own terms, never paraphrase them');
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

test('the close: who you would work with, the button again, and one quiet software line', () => {
  const who = section('who');
  assert.match(who, /PhD in environmental data science from the University of Sydney/);
  // Sam, 3 Nov 2026: drop the number (three of the "seven" were specced, not built).
  // "AI brain" on sales pages (Sam, 19 Nov 2026); the docs and app keep "assistant".
  assert.match(who, /I build AI systems for clients and for myself, including the AI brain that runs my own week/);
  assert.ok(!/seven AI systems/.test(who), 'no build count');
  assert.match(who, /I run every roadmap call myself/);
  assert.match(who, /src="\/lib\/img\/sam-photo\.jpg"/, 'Sam\'s own headshot stays in the bio (Sam, 3 Nov 2026)');
  assert.match(who, /href="\/about"/);
  assert.match(who, /class="cta-primary" href="\/book\/roadmap">Book an AI roadmap</);
  assert.ok(!/href="\/book\/discovery"/.test(main), 'the discovery call is off the site (Sam, 3 Nov 2026); the roadmap is the one front door');
  // Sam, 19 Nov 2026: one quiet line; the download lives in the footer.
  assert.match(who, /<p class="diy">Runs on Crads-AI, free and open source\. <a href="\/docs">Docs →<\/a><\/p>/);
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
