// tests/writingFeed.test.js - writing/feed.xml must equal what
// scripts/build-feed.mjs would write, list every essay, and be advertised by
// every writing page. An essay published without `npm run feed` fails here.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const ALT = '<link rel="alternate" type="application/rss+xml" title="Sam Davis · Writing" href="/writing/feed.xml">';

async function gen() {
  return import(pathToFileURL(path.join(ROOT, 'scripts', 'build-feed.mjs')).href);
}

function writingPages() {
  const dir = path.join(ROOT, 'writing');
  const pages = ['writing/index.html'];
  for (const slug of fs.readdirSync(dir)) {
    if (fs.existsSync(path.join(dir, slug, 'index.html'))) pages.push(`writing/${slug}/index.html`);
  }
  return pages;
}

test('writing/feed.xml is current', async () => {
  const { render } = await gen();
  const have = fs.readFileSync(path.join(ROOT, 'writing', 'feed.xml'), 'utf8');
  assert.strictEqual(have, render(), 'run `npm run feed`');
});

test('the feed has one item per essay, newest first, with absolute links', async () => {
  const { feedItems } = await gen();
  const items = feedItems();
  assert.strictEqual(items.length, writingPages().length - 1);
  for (const it of items) assert.ok(it.link.startsWith('https://crads-ai.com/writing/'), it.link);
  const dates = items.map((i) => i.date);
  assert.deepStrictEqual(dates, [...dates].sort().reverse());
});

test('every writing page advertises the feed', () => {
  for (const rel of writingPages()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.includes(ALT), `${rel} is missing the RSS alternate link`);
  }
});

test('every essay declares its lane and carries that lane\'s note under the byline', async () => {
  const { essayLane, LANE_NOTES } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'syndicate.mjs')).href);
  for (const rel of writingPages().filter((r) => r !== 'writing/index.html')) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lane = essayLane(src, rel);
    const notes = [...src.matchAll(/<p class="essay-process">([^<]*)<\/p>/g)].map((m) => m[1]);
    assert.deepStrictEqual(notes, [LANE_NOTES[lane]], `${rel} (${lane}) must carry exactly its lane's note`);
    // No other lane's note may appear anywhere on the page.
    for (const [other, note] of Object.entries(LANE_NOTES)) {
      if (other !== lane) assert.ok(!src.includes(note), `${rel} (${lane}) carries the ${other} note`);
    }
  }
});

test('the essay lane is required and must be known', async () => {
  const { essayLane } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'syndicate.mjs')).href);
  assert.throws(() => essayLane('<html></html>', 'x'), /no essay-lane/);
  assert.throws(() => essayLane('<meta name="essay-lane" content="ghost">', 'x'), /unknown essay-lane/);
  assert.strictEqual(essayLane('<meta name="essay-lane" content="my-pen:strict">', 'x'), 'my-pen:strict');
});

test('every feed item carries its essay\'s lane', async () => {
  const { render, feedItems } = await gen();
  const xml = render();
  assert.ok(xml.includes('xmlns:crads="https://crads-ai.com/ns/writing"'));
  const items = feedItems();
  assert.strictEqual((xml.match(/<crads:lane>/g) || []).length, items.length);
  for (const it of items) assert.ok(['with-claude', 'my-pen:editor', 'my-pen:strict'].includes(it.lane), `${it.slug}: ${it.lane}`);
});
