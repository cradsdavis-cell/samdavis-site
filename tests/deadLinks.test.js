// tests/deadLinks.test.js - no served page links to a URL this deploy does not
// answer. Before 2026-09-09 nothing checked /docs at all: a docs page could be
// retired in the app repo and every marketing link to it would 404 in silence.
//
// A site-relative href/src/poster resolves if it is: a served file, X/index.html,
// X.html, a vercel.json rewrite or redirect source, or api/<path>.js. Redirect
// destinations must resolve and must never themselves be a redirect source
// (no chains, no loops). Nav items may not point at a redirect source.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, servedFiles, servedHtml } = require('../scripts/served.js');
const { NAV_ITEMS } = require('../lib/site.js');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const served = new Set(servedFiles());
const rewriteSources = (cfg.rewrites || []).map((r) => r.source);
const redirectSources = new Set((cfg.redirects || []).map((r) => r.source));

function patternMatches(pattern, url) {
  // vercel path patterns: literal, or :param segments
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z0-9_]+/g, '[^/]+') + '$');
  return re.test(url);
}

function resolves(url) {
  const clean = url.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return true;
  const rel = clean.replace(/^\//, '').replace(/\/$/, '');
  if (served.has(rel)) return true;
  if (served.has(`${rel}/index.html`)) return true;
  if (served.has(`${rel}.html`)) return true;
  if (rel.startsWith('api/') && (fs.existsSync(path.join(ROOT, `${rel}.js`)) || fs.existsSync(path.join(ROOT, rel, 'index.js')))) return true;
  if (redirectSources.has(clean)) return true;
  if (rewriteSources.some((p) => patternMatches(p, clean))) return true;
  return false;
}

function linksIn(html) {
  const out = [];
  // inline scripts build URLs from fragments ('/docs/' + slug); only markup counts
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const re = /\b(?:href|src|poster)="(\/[^"]*)"/g;
  let m;
  while ((m = re.exec(markup))) {
    const v = m[1];
    if (v.startsWith('//')) continue; // protocol-relative external
    out.push(v);
  }
  return out;
}

test('every site-relative link on every served page resolves', () => {
  const bad = [];
  for (const rel of servedHtml()) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const url of new Set(linksIn(html))) {
      if (!resolves(url)) bad.push(`${rel} -> ${url}`);
    }
  }
  assert.deepStrictEqual(bad, [], `dead internal links:\n${bad.join('\n')}`);
});

test('same-page fragment targets exist', () => {
  const bad = [];
  for (const rel of servedHtml()) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/\bhref="#([^"]+)"/g)) {
      if (!ids.has(m[1])) bad.push(`${rel} -> #${m[1]}`);
    }
  }
  assert.deepStrictEqual(bad, [], `dangling fragments:\n${bad.join('\n')}`);
});

test('redirects land on real pages and never chain', () => {
  for (const r of cfg.redirects || []) {
    assert.ok(!redirectSources.has(r.destination), `${r.source} -> ${r.destination} chains into another redirect`);
    assert.ok(resolves(r.destination), `${r.source} -> ${r.destination} does not resolve`);
  }
});

test('nav items resolve and are not redirect sources', () => {
  for (const it of NAV_ITEMS) {
    assert.ok(resolves(it.href), `nav ${it.href} does not resolve`);
    assert.ok(!redirectSources.has(it.href), `nav ${it.href} is a redirect source`);
  }
});
