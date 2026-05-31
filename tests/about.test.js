'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'about', 'index.html'),
  'utf8'
);

test('about page has the canonical head', () => {
  assert.ok(html.includes('<title>About — Sam Davis</title>'),
    'expected canonical title');
  assert.ok(html.includes('href="/lib/site.css"'),
    'expected shared CSS link');
  assert.ok(html.includes('src="/lib/site.js"'),
    'expected shared JS link');
});

test('about page renders the canonical nav with About marked current', () => {
  assert.ok(html.includes('<nav class="site-nav-bar">'),
    'expected canonical site-nav-bar');
  assert.match(html, /<a href="\/about" class="current">About<\/a>/,
    'expected About link marked current');
  assert.ok(html.includes('<a href="/">Home</a>'));
  assert.ok(html.includes('<a href="/overview">Overview</a>'));
  assert.ok(html.includes('<a href="/offer">Offer</a>'));
  assert.ok(html.includes('<a href="/book">Book →</a>'));
});

test('about page has identity rail with name', () => {
  assert.match(html, /Samuel<br>Caradog Davis/,
    'expected name with line break');
});

test('about page has the three main section headings', () => {
  assert.ok(html.includes('>Experience<'), 'expected Experience heading');
  assert.ok(html.includes('>Side practice<'), 'expected Side practice heading');
  assert.ok(html.includes('>Builds'), 'expected Builds heading');
});

test('about page renders the canonical site-footer', () => {
  assert.ok(html.includes('<footer class="site-footer wrap">'),
    'expected canonical site-footer');
});
