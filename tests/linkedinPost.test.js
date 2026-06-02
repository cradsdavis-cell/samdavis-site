'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { linkedInPostEmbed } = require('../lib/linkedinPost');

test('linkedInPostEmbed returns iframe HTML for a valid LinkedIn post URL', () => {
  const url = 'https://www.linkedin.com/posts/abbey-example_activity-7123456789012345678-AbCd';
  const html = linkedInPostEmbed(url);
  assert.ok(html, 'expected iframe HTML, got null');
  assert.match(html, /^<iframe /, 'expected iframe tag');
  assert.ok(html.includes('urn:li:share:7123456789012345678'),
    'expected URN embedded in src');
  assert.ok(html.includes('src="https://www.linkedin.com/embed/feed/update/urn:li:share:7123456789012345678?compact=1"'),
    'expected canonical embed src URL with compact=1');
  assert.ok(html.includes('title="LinkedIn post embed"'), 'expected accessibility title');
  assert.ok(html.includes('loading="lazy"'), 'expected lazy loading');
  assert.ok(html.includes('max-width:504px'), 'expected max-width style cap');
  assert.ok(html.includes('width="100%"'), 'expected responsive width');
});

test('linkedInPostEmbed returns null for an unparseable URL', () => {
  assert.strictEqual(linkedInPostEmbed('https://example.com/not-linkedin'), null);
  assert.strictEqual(linkedInPostEmbed('https://www.linkedin.com/in/some-profile'), null);
  assert.strictEqual(linkedInPostEmbed('https://www.linkedin.com/posts/abbey_no-activity-suffix'), null);
  assert.strictEqual(linkedInPostEmbed('activity-123'), null,
    'expected null for URN shorter than 15 digits');
  assert.strictEqual(linkedInPostEmbed(''), null);
});

test('linkedInPostEmbed handles URN at extreme valid lengths (15 and 25 digits)', () => {
  const min = 'https://www.linkedin.com/posts/x_activity-' + '1'.repeat(15) + '-AbCd';
  const max = 'https://www.linkedin.com/posts/x_activity-' + '9'.repeat(25) + '-AbCd';
  const minHtml = linkedInPostEmbed(min);
  const maxHtml = linkedInPostEmbed(max);
  assert.ok(minHtml, 'expected iframe HTML for 15-digit URN');
  assert.ok(maxHtml, 'expected iframe HTML for 25-digit URN');
  assert.ok(minHtml.includes('urn:li:share:' + '1'.repeat(15)),
    'expected 15-digit URN preserved');
  assert.ok(maxHtml.includes('urn:li:share:' + '9'.repeat(25)),
    'expected 25-digit URN preserved');
});

test('linkedInPostEmbed returns null for non-string inputs', () => {
  assert.strictEqual(linkedInPostEmbed(null), null);
  assert.strictEqual(linkedInPostEmbed(undefined), null);
  assert.strictEqual(linkedInPostEmbed(12345), null);
  assert.strictEqual(linkedInPostEmbed({}), null);
});
