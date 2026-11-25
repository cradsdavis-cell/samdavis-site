// scripts/build-sitemap.mjs - sitemap.xml is GENERATED, never hand-edited.
//   node scripts/build-sitemap.mjs        writes sitemap.xml
//   import { expectedUrls }               what tests/sitemap.test.js pins
//
// Rules: every served HTML page on its clean URL, plus /download (a rewrite to
// a function), minus the account portal, the utility pages (404, thanks,
// booking-failed), anything carrying a noindex meta, and any path that
// vercel.json redirects away. lastmod is the date of the last commit that
// changed what the page says (see contentOf), not merely the file.
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
  // A host redirect (www to the bare domain) moves the host, not the page, so
  // its source ("/" among them) never retires a URL from the sitemap.
  return new Set((cfg.redirects || [])
    .filter((r) => !(r.has || []).some((h) => h.type === 'host'))
    .map((r) => r.source));
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

// What a page says, without the parts every page shares. Site-wide changes
// (the nav bar, the docs sidebar, search index, breadcrumbs and footer, <head>
// edits such as titles) rewrite every file in one commit, so the file's last
// commit date put 54 of 86 sitemap entries on 19 Nov 2026, and Google ignores
// lastmod values it cannot trust. Dating each page by this reduced text keeps
// lastmod to edits a reader would notice.
export function contentOf(html) {
  return String(html)
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const git = (args) => execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// The newest commit whose version of the file reads differently from the
// version before it. A file whose every commit was chrome-only keeps the date
// it first appeared.
export function contentDate(rel) {
  const commits = git(`log --format="%H %cs" -- "${rel}"`).trim().split('\n').filter(Boolean)
    .map((l) => { const [hash, date] = l.split(' '); return { hash, date }; });
  if (!commits.length) return null;
  const version = (c) => {
    try { return contentOf(git(`show "${c.hash}:${rel}"`)); } catch { return null; }
  };
  let newer = version(commits[0]);
  for (let i = 0; i < commits.length - 1; i++) {
    const older = version(commits[i + 1]);
    if (older !== newer) return commits[i].date;
    newer = older;
  }
  return commits[commits.length - 1].date;
}

function lastmod(url) {
  const candidates = url === '/' ? ['index.html']
    : [url.slice(1) + '/index.html', url.slice(1) + '.html'];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(ROOT, rel))) {
      try {
        const d = contentDate(rel);
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
