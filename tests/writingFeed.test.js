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
