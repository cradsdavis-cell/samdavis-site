// scripts/write-static-nav.js - paste the nav that lib/site.js renders into
// every site-owned page as its no-JS fallback. Run after changing NAV_ITEMS:
//   npm run nav
// Docs pages are generated in the app repo and are NOT touched here; site.js
// replaces their nav at runtime and the app repo's shell copies this markup.
'use strict';
const fs = require('fs');
const path = require('path');
const { navHTML } = require('../lib/site.js');
const { ROOT, servedHtml, urlOf } = require('./served.js');

const NAV_RE = /<nav class="site-nav-bar"[^>]*>[\s\S]*?<\/nav>/;
let changed = 0;
for (const rel of servedHtml()) {
  if (rel.startsWith('docs/')) continue;
  const fp = path.join(ROOT, rel);
  const src = fs.readFileSync(fp, 'utf8');
  if (!NAV_RE.test(src)) continue;
  const next = src.replace(NAV_RE, navHTML(urlOf(rel)));
  if (next !== src) { fs.writeFileSync(fp, next); changed++; console.log('nav:', rel); }
}
console.log(`${changed} page(s) rewritten`);
