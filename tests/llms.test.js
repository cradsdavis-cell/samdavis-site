// tests/llms.test.js - llms.txt must equal what scripts/build-llms.mjs would
// write, so a page added, retitled or retired without `npm run llms` fails here.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');

test('llms.txt is current (run `npm run llms`)', async () => {
  const { render } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'build-llms.mjs')).href);
  assert.strictEqual(fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8'), render());
});

test('llms.txt never claims the data stays local', () => {
  const txt = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  assert.ok(!/stays? (local|on your (computer|machine))|never leaves your/i.test(txt));
  assert.ok(!txt.includes('—'), 'no em dashes');
});
