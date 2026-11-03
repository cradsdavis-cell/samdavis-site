// scripts/write-static-nav.js - paste the nav and footer that lib/site.js
// renders into every site-owned page as their no-JS fallback. Run after
// changing NAV_ITEMS or FOOTER_GROUPS:
//   npm run nav
// Docs pages are generated in the app repo and are NOT touched here; site.js
// replaces their nav and footer at runtime and the app repo's shell copies
// this markup.
'use strict';
const fs = require('fs');
const path = require('path');
const { navHTML, footerHTML } = require('../lib/site.js');
const { ROOT, servedHtml, urlOf } = require('./served.js');

const NAV_RE = /<nav class="site-nav-bar"[^>]*>[\s\S]*?<\/nav>/;
const FOOTER_RE = /<footer class="site-footer[^"]*"[^>]*>[\s\S]*?<\/footer>/;
let changed = 0;
for (const rel of servedHtml()) {
  if (rel.startsWith('docs/')) continue;
  const fp = path.join(ROOT, rel);
  const src = fs.readFileSync(fp, 'utf8');
  let next = src;
  if (NAV_RE.test(next)) next = next.replace(NAV_RE, navHTML(urlOf(rel)));
  if (FOOTER_RE.test(next)) next = next.replace(FOOTER_RE, footerHTML());
  if (next !== src) { fs.writeFileSync(fp, next); changed++; console.log('nav/footer:', rel); }
}
console.log(`${changed} page(s) rewritten`);
