// tests/syndicate.test.js - the portable copy of each essay (scripts/syndicate.mjs),
// which the full-text feed carries and Substack / LinkedIn get pasted from, must be
// whole, self-contained and honest: drafting note first, absolute links only, no SVG,
// classes or inline styles, and a PNG on disk for every figure it swaps in.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const lib = () => import(pathToFileURL(path.join(ROOT, 'scripts', 'syndicate.mjs')).href);

function essays() {
  const dir = path.join(ROOT, 'writing');
  return fs.readdirSync(dir)
    .filter((slug) => fs.existsSync(path.join(dir, slug, 'index.html')))
    .map((slug) => ({ slug, src: fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8') }));
}

test('every essay syndicates to clean, self-contained HTML', async () => {
  const { syndicationHtml, DRAFTING_NOTE, HOST } = await lib();
  for (const { slug, src } of essays()) {
    const url = `${HOST}/writing/${slug}`;
    const html = syndicationHtml(src, { slug, url });
    assert.ok(html.startsWith(`<p><em>${DRAFTING_NOTE}</em></p>`), `${slug}: drafting note must lead`);
    assert.ok(html.includes(`<a href="${url}">crads-ai.com</a>`), `${slug}: first-published line`);
    for (const bad of ['<svg', '<div', '<details', '<section', 'class=', 'style=', 'loading=']) {
      assert.ok(!html.includes(bad), `${slug}: ${bad} left in`);
    }
    for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      assert.match(m[1], /^(https?:\/\/|mailto:)/, `${slug}: relative URL ${m[1]}`);
    }
    // Every paragraph of the page survives (no essay text silently dropped), except
    // those inside chart cards, which travel as the card's PNG.
    const body = src.match(/<article class="essay-body">[\s\S]*?<\/article>/)[0]
      .replace(/<figure\b[^>]*>(?:(?!<img\b)[\s\S])*?<\/figure>/g, '');
    const paras = (body.match(/<p\b/g) || []).length;
    assert.ok((html.match(/<p>/g) || []).length >= paras, `${slug}: lost paragraphs`);
  }
});

test('every swapped figure has its PNG snapshot', async () => {
  const { essayBody, figureSnaps } = await lib();
  for (const { slug, src } of essays()) {
    for (const { n } of figureSnaps(essayBody(src))) {
      const png = path.join(ROOT, 'writing', slug, `fig-${n}.png`);
      assert.ok(fs.existsSync(png), `${slug}: missing fig-${n}.png (run scripts/snap-figures.mjs ${slug})`);
    }
  }
});

test('the feed carries the full text of every essay', () => {
  const feed = fs.readFileSync(path.join(ROOT, 'writing', 'feed.xml'), 'utf8');
  assert.ok(feed.includes('xmlns:content="http://purl.org/rss/1.0/modules/content/"'));
  assert.strictEqual((feed.match(/<content:encoded>/g) || []).length, (feed.match(/<item>/g) || []).length);
});
