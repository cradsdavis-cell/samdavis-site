// scripts/build-llms.mjs - llms.txt is GENERATED, never hand-edited.
//   node scripts/build-llms.mjs        writes llms.txt
//   import { render }                   what tests/llms.test.js pins
//
// llms.txt (https://llmstxt.org) is a plain-Markdown map of the site for AI
// assistants and answer engines: what Crads-AI is, in a few checkable lines,
// then every public page with its own title and meta description. The page
// list is the sitemap's (expectedUrls), so the two can never disagree; the
// summary at the top is the only hand-written part. Keep it to facts the site
// already states, and never "your data stays local" (local mode still talks to
// Claude).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { expectedUrls } from './build-sitemap.mjs';

const require = createRequire(import.meta.url);
const { ROOT } = require('./served.js');
const HOST = 'https://crads-ai.com';

const SUMMARY = `# Crads-AI

> Crads-AI is a free, open-source (AGPL-3.0) AI assistant built on Claude, for
> small-business owners and independent professionals. It runs on a server you
> own (Hetzner or DigitalOcean) or on your own computer, uses your own Claude
> subscription, keeps its memory as plain Markdown backed up to a private GitHub
> repository on your account, and connects to the tools you already use. It is
> made by Dr Sam Davis in Sydney, Australia.

- The software is free. You pay for your own Claude subscription and, if you
  run it on a server, your own hosting provider; nothing is paid to Crads-AI to
  use it.
- There is no Crads-AI account, central server or billing in the loop: the
  server, the SSH key and the accounts are yours.
- Paid help is optional: a walkthrough, a guided setup and ongoing support
  (see Setup and support below).
- Source code: https://github.com/cradsdavis-cell/crads-ai
- Desktop app (Windows and macOS): ${HOST}/download
`;

const SECTIONS = [
  ['Start here', (u) => ['/', '/how-it-works', '/download', '/docs', '/docs/faq', '/docs/what-a-mineral-is', '/docs/self-hosted-claude', '/docs/what-an-ai-ea-is'].includes(u)],
  ['Docs', (u) => u.startsWith('/docs/')],
  ['Setup and support', (u) => u === '/offer' || u.startsWith('/book')],
  ['About', (u) => u === '/about'],
  ['Writing', (u) => u.startsWith('/writing')],
];

const MANUAL = {
  '/download': ['Download Crads-AI', 'The Crads-AI desktop app for Windows and macOS: a setup wizard, a panel and a terminal for your assistant.'],
};

const decode = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function meta(url) {
  if (MANUAL[url]) return MANUAL[url];
  const rel = url === '/' ? 'index.html'
    : [url.slice(1) + '/index.html', url.slice(1) + '.html'].find((r) => fs.existsSync(path.join(ROOT, r)));
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const og = src.match(/<meta property="og:title" content="([^"]*)"/);
  const title = og ? og[1] : src.match(/<title>([^<]*)<\/title>/)[1];
  const desc = (src.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1];
  return [decode(title).replace(/ · (Crads-AI|Sam Davis).*$/, ''), decode(desc)];
}

export function render() {
  const urls = expectedUrls();
  const placed = new Set();
  const out = [SUMMARY];
  for (const [name, match] of SECTIONS) {
    const mine = urls.filter((u) => !placed.has(u) && match(u));
    if (!mine.length) continue;
    out.push(`## ${name}\n`);
    for (const u of mine) {
      placed.add(u);
      const [title, desc] = meta(u);
      out.push(`- [${title}](${HOST}${u})${desc ? `: ${desc}` : ''}`);
    }
    out.push('');
  }
  const rest = urls.filter((u) => !placed.has(u));
  if (rest.length) throw new Error(`llms.txt has no section for: ${rest.join(', ')}`);
  return out.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), render());
  console.log(`llms.txt: ${expectedUrls().length} pages`);
}
