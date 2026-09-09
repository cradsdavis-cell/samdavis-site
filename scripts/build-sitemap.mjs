// scripts/build-sitemap.mjs - sitemap.xml is GENERATED, never hand-edited.
//   node scripts/build-sitemap.mjs        writes sitemap.xml
//   import { expectedUrls }               what tests/sitemap.test.js pins
//
// Rules: every served HTML page on its clean URL, plus /download (a rewrite to
// a function), minus the account portal, the utility pages (404, thanks,
// booking-failed), anything carrying a noindex meta, and any path that
// vercel.json redirects away. lastmod is the file's last commit date.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ROOT, servedHtml, urlOf } = require('./served.js');
const HOST = 'https://crads-ai.com';

const EXCLUDE_FILES = new Set(['404.html', 'thanks.html', 'booking-failed.html']);

function redirectSources() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  return new Set((cfg.redirects || []).map((r) => r.source));
}

export function expectedUrls() {
  const gone = redirectSources();
  const urls = new Set(['/download']);
  for (const rel of servedHtml()) {
    if (rel.startsWith('account/') || rel.startsWith('lib/')) continue; // portal + unlisted client materials
    if (EXCLUDE_FILES.has(rel)) continue;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(src)) continue;
    const url = urlOf(rel);
    if (gone.has(url)) continue;
    urls.add(url);
  }
  return [...urls].sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}

function lastmod(url) {
  const candidates = url === '/' ? ['index.html']
    : [url.slice(1) + '/index.html', url.slice(1) + '.html'];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(ROOT, rel))) {
      try {
        const d = execSync(`git log -1 --format=%cs -- "${rel}"`, { cwd: ROOT, encoding: 'utf8' }).trim();
        if (d) return d;
      } catch { /* untracked or no git: fall through */ }
      return new Date(fs.statSync(path.join(ROOT, rel)).mtime).toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function priority(url) {
  if (url === '/') return '1.0';
  if (url === '/download' || url === '/docs' || url === '/offer') return '0.9';
  if (url.startsWith('/docs/')) return '0.6';
  return '0.7';
}

export function render() {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const u of expectedUrls()) {
    lines.push(`  <url><loc>${HOST}${u}</loc><lastmod>${lastmod(u)}</lastmod><priority>${priority(u)}</priority></url>`);
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), render());
  console.log(`sitemap.xml: ${expectedUrls().length} urls`);
}
