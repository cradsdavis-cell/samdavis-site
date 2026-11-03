// tests/newsletterIndex.test.js - /newsletter is the home of Restless Optimist
// (Sam, 3 Nov 2026): the name, a sign-up, the newest issue in full, then every
// issue. The page is generated from the issue pages; this fails when it is stale.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('newsletter/index.html is current (run `npm run newsletter`)', async () => {
  const { readIssues, renderIndex } = await import('../scripts/build-newsletter-index.mjs');
  assert.strictEqual(read('newsletter/index.html'), renderIndex(readIssues()));
});

test('/newsletter: name, sign-up spot, the booking notice, latest issue in full, every issue listed', async () => {
  const { readIssues } = await import('../scripts/build-newsletter-index.mjs');
  const issues = readIssues();
  const html = read('newsletter/index.html');
  assert.match(html, /<h1>Restless Optimist<\/h1>/);
  assert.match(html, /<div class="letter-signup"><\/div>/, 'site.js puts the sign-up form here');
  assert.match(html, /every booking adds you, and every issue has a one-click unsubscribe/);
  assert.match(html, new RegExp(`Latest issue <span>No\\. ${issues[0].number} `));
  assert.ok(html.includes(issues[0].body), 'the newest issue is shown in full');
  for (const i of issues) assert.ok(html.includes(`href="/newsletter/${i.number}"`), `No. ${i.number} is missing from the archive`);
});

test('every issue page is stamped, and no public copy carries a subscriber-only code', async () => {
  const { readIssues } = await import('../scripts/build-newsletter-index.mjs');
  const issues = readIssues();
  assert.ok(issues.length >= 3);
  for (const i of issues) {
    assert.ok(i.subject && i.date, `No. ${i.number} lacks data-subject or data-date`);
    const page = read(`newsletter/${i.number}/index.html`);
    assert.ok(!/[?&]code=/.test(page), `No. ${i.number} publishes a booking code`);
    assert.match(page, /<title>Restless Optimist, No\. \d+ · Sam Davis<\/title>/);
  }
});
