// scripts/build-feed.mjs - writing/feed.xml is GENERATED, never hand-edited.
//   node scripts/build-feed.mjs           writes writing/feed.xml
//   import { feedItems, render }          what tests/writingFeed.test.js pins
//
// One RSS 2.0 item per writing/<slug>/index.html, read from the page's own
// metadata: <title> (minus " · Sam Davis"), meta description, canonical URL and
// the Article JSON-LD datePublished. Newest first. Output is deterministic
// (lastBuildDate = newest datePublished), so the freshness test is stable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITING = path.join(ROOT, 'writing');
const HOST = 'https://crads-ai.com';
export const FEED_PATH = '/writing/feed.xml';

const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pick(src, re, what, rel) {
  const m = src.match(re);
  if (!m) throw new Error(`${rel}: no ${what}`);
  return unescapeHtml(m[1].trim());
}

export function feedItems() {
  const items = [];
  for (const slug of fs.readdirSync(WRITING)) {
    const rel = `writing/${slug}/index.html`;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    items.push({
      slug,
      title: pick(src, /<title>([^<]+)<\/title>/, 'title', rel).replace(/\s*·\s*Sam Davis$/, ''),
      description: pick(src, /<meta name="description" content="([^"]*)"/, 'meta description', rel),
      link: pick(src, /<link rel="canonical" href="([^"]+)"/, 'canonical', rel),
      date: pick(src, /"datePublished":"(\d{4}-\d{2}-\d{2})"/, 'datePublished', rel),
    });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

// Midnight Sydney time on the publish day, written with its own offset so
// readers show the date the essay went up.
const rfc822 = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  const [wd, dd, mon, yyyy] = d.toUTCString().replace(',', '').split(' ');
  return `${wd}, ${dd} ${mon} ${yyyy} 00:00:00 +1000`;
};

export function render() {
  const items = feedItems();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    '  <title>Sam Davis · Writing</title>',
    `  <link>${HOST}/writing</link>`,
    `  <atom:link href="${HOST}${FEED_PATH}" rel="self" type="application/rss+xml"/>`,
    '  <description>Essays by Sam Davis on the questions underneath AI: what these systems will want, whose values they\'ll carry, and what we owe them.</description>',
    '  <language>en-au</language>',
  ];
  if (items.length) lines.push(`  <lastBuildDate>${rfc822(items[0].date)}</lastBuildDate>`);
  for (const it of items) {
    lines.push(
      '  <item>',
      `    <title>${esc(it.title)}</title>`,
      `    <link>${esc(it.link)}</link>`,
      `    <guid isPermaLink="true">${esc(it.link)}</guid>`,
      `    <pubDate>${rfc822(it.date)}</pubDate>`,
      '    <dc:creator>Sam Davis</dc:creator>',
      `    <description>${esc(it.description)}</description>`,
      '  </item>',
    );
  }
  lines.push('</channel>', '</rss>', '');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(path.join(ROOT, FEED_PATH.slice(1)), render());
  console.log(`writing/feed.xml: ${feedItems().length} items`);
}
