// tests/docsShots.test.js - every screenshot under docs/shots is referenced by
// a published docs page, and every reference has its file. publish.mjs in the
// app repo copies only referenced shots in, but never prunes; before 2026-09-09
// thirteen dead PNGs of retired surfaces sat here as live URLs.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, servedHtml } = require('../scripts/served.js');

function refs(dir, prefix) {
  const out = new Map();
  for (const rel of servedHtml()) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of html.matchAll(new RegExp(`${prefix.replace(/\//g, '\\/')}([A-Za-z0-9._-]+)`, 'g'))) {
      if (!out.has(m[1])) out.set(m[1], rel);
    }
  }
  return out;
}

for (const [dir, prefix] of [['docs/shots', '/docs/shots/'], ['lib/img/shots', '/lib/img/shots/']]) {
  test(`${dir}: every file is referenced and every reference exists`, () => {
    const abs = path.join(ROOT, dir);
    const files = fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => !f.startsWith('.')) : [];
    const used = refs(dir, prefix);
    const dead = files.filter((f) => !used.has(f));
    assert.deepStrictEqual(dead, [], `${dir} holds unreferenced files: ${dead.join(', ')}`);
    const missing = [...used.entries()].filter(([f]) => !files.includes(f)).map(([f, from]) => `${from} -> ${f}`);
    assert.deepStrictEqual(missing, [], `references to missing shots:\n${missing.join('\n')}`);
  });
}
