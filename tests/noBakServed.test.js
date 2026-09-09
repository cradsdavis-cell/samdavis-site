// tests/noBakServed.test.js - nothing that is not the site is served. Six
// tracked *.html.bak files, a dead private key and one-off KV scripts were
// all public URLs until 2026-09-09; this refuses their return.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, servedFiles, loadIgnore } = require('../scripts/served.js');

test('no backup, key, editor or scratch file is served', () => {
  const bad = servedFiles().filter((f) => /\.(bak|pem|key|orig|swp|rej)$|~$/.test(f));
  assert.deepStrictEqual(bad, [], `served junk:\n${bad.join('\n')}`);
});

test('.vercelignore keeps the paper trail and the tooling off the deploy', () => {
  const raw = loadIgnore().map((r) => r.raw);
  for (const need of ['archive/', 'scripts/', 'scratchpad/', 'brand/', 'tests/']) {
    assert.ok(raw.includes(need), `.vercelignore must list ${need}`);
  }
  const served = servedFiles();
  assert.ok(!served.some((f) => f.startsWith('archive/') || f.startsWith('scripts/')), 'archive/ and scripts/ leak');
});

test('no markdown is served except nothing (engineering docs live in archive/)', () => {
  const md = servedFiles().filter((f) => f.endsWith('.md'));
  assert.deepStrictEqual(md, [], `served markdown:\n${md.join('\n')}`);
});

test('archive/ carries a README naming every dated folder', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'archive', 'README.md'), 'utf8');
  for (const d of fs.readdirSync(path.join(ROOT, 'archive'))) {
    if (d === 'README.md') continue;
    assert.ok(readme.includes(`${d}/`), `archive/README.md does not mention ${d}/`);
  }
});
