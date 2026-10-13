// 2026-10-13: local mode ("On this computer") was retired from Crads-AI. Every
// mineral lives on a server in the member's own hosting account, and the
// public copy says one thing. This pins the retirement on the hand-written
// pages so a stray "or on your own computer" cannot drift back in. The docs
// pages are generated from ai-os and pinned there.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES = [
  'index.html', 'offer/index.html', 'how-it-works/index.html', 'about/index.html',
  'book/walkthrough.html', 'book/guided-setup.html', 'lib/downloadPage.js', 'llms.txt',
  'guides/claude-remember-your-business/index.html', 'guides/ai-social-media-posts/index.html',
  'guides/ai-proposals-and-quotes/index.html',
];
const LOCAL = /on this computer|on your own computer|or your own computer|local or hosted|hosted or local|same price either way|only awake when you are|free to run|if it lives on a server/i;

for (const rel of PAGES) {
  test(`${rel} carries no local-mode copy`, () => {
    const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const m = body.match(LOCAL);
    assert.ok(!m, `${rel}: found "${m && m[0]}"`);
  });
}
