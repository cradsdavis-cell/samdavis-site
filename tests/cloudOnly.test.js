// 2026-10-13: local mode ("On this computer") was retired from Crads-AI. Every
// mineral lives on a server in the member's own hosting account, and the
// public copy says one thing. This pins the retirement on the hand-written
// pages so a stray "or on your own computer" cannot drift back in. The docs
// pages are generated from ai-os and pinned there.
//
// 2026-10-14: brought back HIDDEN (Sam: "I want to definitely prioritise people
// using their own servers over anything else"). The one allowed place is the
// closed "More options" fold on /offer, after the "Where it lives" note. The
// fold carries two options: a folder on your own computer, and (added the same
// day, after the cloud test passed) Claude's own cloud.
// Everywhere else, including the rest of /offer, stays server-only.
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

const FOLD = /<details class="retainer-note more-options reveal-on-scroll">[\s\S]*?<\/details>/;

test('offer/index.html keeps the non-server option in ONE closed More options fold, after the server', () => {
  const body = fs.readFileSync(path.join(ROOT, 'offer/index.html'), 'utf8');
  const folds = body.match(new RegExp(FOLD.source, 'g')) || [];
  assert.strictEqual(folds.length, 1, 'exactly one fold');
  assert.match(folds[0], /<summary>More options<\/summary>/);
  assert.doesNotMatch(folds[0], /<details[^>]*\bopen\b/, 'closed by default');
  assert.match(folds[0], /your own computer/, 'it carries the local option');
  assert.match(folds[0], /I'd still pick the server\./, 'and still steers to the server');
  assert.match(folds[0], /Claude's own cloud/, 'it carries the Claude-hosted option (tested 2026-10-14)');
  assert.match(folds[0], /at most hourly/, 'with its honest limit');
  const where = body.indexOf('<strong>Where it lives.</strong>');
  assert.ok(where > -1 && where < body.indexOf(folds[0]), 'the server note comes first');
});

for (const rel of PAGES) {
  test(`${rel} carries no local-mode copy`, () => {
    const body = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(FOLD, '');
    const m = body.match(LOCAL);
    assert.ok(!m, `${rel}: found "${m && m[0]}"`);
  });
}
