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
//
// 2026-10-15: local becomes the LAST, plainer option beside the server (Sam:
// the local option sits with the hosting choices "as a less attractive offer,
// despite it being free"), and members can move between the two in the app.
// Allowed places: the /offer "Where it lives" note (after the server, with its
// downsides) and the last item of the how-it-works "Where it lives" list. The
// More options fold now carries only Claude's own cloud.
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

const WHERE = /<strong>Where it lives\.<\/strong>[\s\S]*?<\/p>/;
const LIVES_LOCAL = /<li><strong>Or on this computer, last on the list\.<\/strong>[^<]*<\/li>/;

test('offer/index.html: the server first, then the computer, last and with its downsides', () => {
  const body = fs.readFileSync(path.join(ROOT, 'offer/index.html'), 'utf8');
  const where = body.match(WHERE);
  assert.ok(where, 'the Where it lives note');
  const server = where[0].indexOf('small server in your own hosting account');
  const local = where[0].indexOf('a folder on your own computer');
  assert.ok(server > -1 && local > server, 'server named before the computer');
  assert.match(where[0], /last and cheapest/);
  assert.match(where[0], /no schedule, no phone, and it stops when your laptop sleeps/);
  assert.match(where[0], /move it to a server any time, and back/);
});

test('offer/index.html keeps ONE closed More options fold, now Claude\'s own cloud only', () => {
  const body = fs.readFileSync(path.join(ROOT, 'offer/index.html'), 'utf8');
  const folds = body.match(new RegExp(FOLD.source, 'g')) || [];
  assert.strictEqual(folds.length, 1, 'exactly one fold');
  assert.match(folds[0], /<summary>More options<\/summary>/);
  assert.doesNotMatch(folds[0], /<details[^>]*\bopen\b/, 'closed by default');
  assert.match(folds[0], /Claude's own cloud/, 'it carries the Claude-hosted option (tested 2026-10-14)');
  assert.match(folds[0], /at most hourly/, 'with its honest limit');
  assert.doesNotMatch(folds[0], /your own computer/, 'the computer moved out to Where it lives');
  assert.ok(body.indexOf(body.match(WHERE)[0]) < body.indexOf(folds[0]), 'the server note comes first');
});

test('how-it-works/index.html lists the computer LAST in Where it lives', () => {
  const body = fs.readFileSync(path.join(ROOT, 'how-it-works/index.html'), 'utf8');
  const list = body.match(/<ul class="lives-list">[\s\S]*?<\/ul>/);
  assert.ok(list, 'the lives list');
  const items = list[0].match(/<li>[\s\S]*?<\/li>/g);
  assert.match(items[items.length - 1], LIVES_LOCAL, 'the computer is the last item');
  assert.match(items[items.length - 1], /no schedule, no phone, and it stops when your laptop sleeps/);
});

for (const rel of PAGES) {
  test(`${rel} carries no local-mode copy`, () => {
    const body = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(FOLD, '').replace(WHERE, '').replace(LIVES_LOCAL, '');
    const m = body.match(LOCAL);
    assert.ok(!m, `${rel}: found "${m && m[0]}"`);
  });
}
