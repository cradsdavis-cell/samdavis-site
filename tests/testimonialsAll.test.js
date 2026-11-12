// Every testimonials section lists every testimonial (Sam, 12 Nov 2026:
// "Whenever you see a What clients say section, ALL of the testimonials need
// to be listed"). The rendered strips take the whole set from
// lib/testimonialsRender.js; the homepage carousel is static, so it is checked
// against that set by name.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, servedHtml } = require('../scripts/served.js');

const render = fs.readFileSync(path.join(ROOT, 'lib', 'testimonialsRender.js'), 'utf8');
const allNames = [...render.matchAll(/^\s*name: "([^"]+)"/gm)].map((m) => m[1]);

test('no strip picks a subset of the quotes', () => {
  assert.ok(!/data-pick/.test(render), 'the renderer has no per-page pick');
  for (const rel of servedHtml()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/data-pick=/.test(src), `${rel} picks a subset of the testimonials`);
  }
});

test('the homepage carousel carries every testimonial', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const proof = html.slice(html.indexOf('id="proof"'), html.indexOf('</section>', html.indexOf('id="proof"')));
  const shown = [...proof.matchAll(/<span class="t-name">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepStrictEqual([...shown].sort(), [...allNames].sort());
});
