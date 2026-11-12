// Every offer's outcome line says the same thing everywhere it appears.
//
// The lines come from the offers one-pager's "You end with" row (second-brain
// client-deliverables/crads-offers/offers-one-pager.html), Sam's source of
// truth for the offers since 12 Nov 2026. Each line shows on the /offer card,
// in the /offer comparison table, on the /book card and as the booking page's
// lede. Change the one-pager first, then every place this test names.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const OUTCOMES = {
  roadmap: { line: 'Know where AI fits, and what to do first.', page: 'book/roadmap.html', inTable: false },
  walkthrough: { line: 'Set up, and you can drive it.', page: 'book/walkthrough.html', inTable: true },
  'guided-setup': { line: 'Working in your inbox and calendar.', page: 'book/guided-setup.html', inTable: true },
  'done-for-you': { line: 'Built and working. Your part: one form, two calls.', page: 'book/done-for-you.html', inTable: true },
  bespoke: { line: 'Your biggest problems, solved.', page: null, inTable: true },
};

const offer = read('offer/index.html');
const book = read('book/index.html');

for (const [sku, o] of Object.entries(OUTCOMES)) {
  test(`${sku}: the outcome line matches on every page`, () => {
    const card = offer.match(new RegExp(`<article class="rung[^"]*" data-sku="${sku}"[\\s\\S]*?</article>`));
    assert.ok(card, `/offer has a ${sku} card`);
    assert.ok(card[0].includes(`<p class="rung-outcome">${o.line}</p>`), `/offer ${sku} card opens with its outcome line`);
    if (o.inTable) {
      const row = offer.match(/<tr class="outcome">[\s\S]*?<\/tr>/);
      assert.ok(row && row[0].includes(`>${o.line}</td>`), `/offer table carries the ${sku} outcome`);
    }
    assert.ok(book.includes(`<p class="outcome">${o.line}</p>`), `/book card carries the ${sku} outcome`);
    if (o.page) assert.ok(read(o.page).includes(`<p class="book-lede">${o.line}</p>`), `${o.page} leads with the outcome`);
  });
}

test('the walkthrough connects no tools and builds no skills (Sam, 12 Nov 2026)', () => {
  const card = offer.match(/<article class="rung[^"]*" data-sku="walkthrough"[\s\S]*?<\/article>/)[0];
  for (const html of [card, read('book/walkthrough.html')]) {
    assert.ok(!/CRIT|real problem/.test(html), 'no CRIT, no "solve one real problem"');
    assert.match(html, /private GitHub/, 'the backup to GitHub is part of it');
  }
});

test('the done for you form is not called short', () => {
  for (const rel of ['offer/index.html', 'book/index.html', 'book/done-for-you.html']) {
    assert.ok(!/short form/.test(read(rel)), `${rel} still says "short form"`);
  }
});

test('the one-pager PDF the table links to is shipped', () => {
  assert.match(offer, /href="\/lib\/offers-one-pager\.pdf"/);
  assert.ok(fs.statSync(path.join(ROOT, 'lib/offers-one-pager.pdf')).size > 10000);
});
