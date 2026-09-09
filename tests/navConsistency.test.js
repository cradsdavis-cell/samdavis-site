// tests/navConsistency.test.js - every served page carries exactly one nav and
// it is the nav lib/site.js renders (NAV_ITEMS is the only list). The static
// copy is the no-JS fallback; site.js swaps it at runtime, and because both
// come from navHTML() the swap is invisible. Regenerate with `npm run nav`.
//
// Docs pages (docs/**) are generated in the app repo; they are checked once
// their generator emits the same markup (plan Phase 4 E). Until then the
// runtime replacement keeps them correct and INCLUDE_DOCS stays false.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, servedHtml, urlOf } = require('../scripts/served.js');
const { NAV_ITEMS, navHTML, normalisePath } = require('../lib/site.js');

const INCLUDE_DOCS = false;
const NAV_RE = /<nav class="site-nav-bar"[^>]*>[\s\S]*?<\/nav>/g;

function pages() {
  return servedHtml().filter((rel) => INCLUDE_DOCS || !rel.startsWith('docs/'));
}

test('NAV_ITEMS is the product-first nav', () => {
  const hrefs = NAV_ITEMS.map((i) => i.href);
  for (const h of ['/docs', '/download', '/offer', '/about', '/book']) assert.ok(hrefs.includes(h), `nav lacks ${h}`);
  assert.ok(!hrefs.includes('/account/login'), 'Sign in is not in the nav');
  assert.ok(!hrefs.includes('/coaching') && !hrefs.includes('/system'), 'coaching-era hubs are not in the nav');
});

test('navHTML marks the right item current', () => {
  assert.match(navHTML('/about'), /href="\/about" class="[^"]*\bcurrent\b/);
  assert.match(navHTML('/docs/faq'), /href="\/docs" class="[^"]*\bcurrent\b/);
  assert.match(navHTML('/book/discovery'), /href="\/book" class="[^"]*\bcurrent\b/);
  assert.doesNotMatch(navHTML('/'), /\bcurrent\b/);
  assert.strictEqual(normalisePath('/offer/index.html'), '/offer');
  assert.strictEqual(normalisePath('/thanks.html'), '/thanks');
});

test('every nav-bearing page carries exactly one nav, byte-identical to navHTML()', () => {
  let seen = 0;
  for (const rel of pages()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const navs = src.match(NAV_RE) || [];
    if (navs.length === 0) continue;
    seen++;
    assert.strictEqual(navs.length, 1, `${rel}: ${navs.length} navs (double nav)`);
    assert.strictEqual(navs[0], navHTML(urlOf(rel)), `${rel}: static nav differs from navHTML(); run npm run nav`);
  }
  assert.ok(seen >= 10, `expected the marketing pages to carry a nav, saw ${seen}`);
});

test('no page links the account portal from its nav or footer', () => {
  for (const rel of pages()) {
    if (rel.startsWith('account/')) continue;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const block of [...(src.match(NAV_RE) || []), ...(src.match(/<footer[\s\S]*?<\/footer>/g) || [])]) {
      assert.ok(!block.includes('/account/login'), `${rel}: Sign in link still present`);
    }
  }
});
