'use strict';
// tests/appShell.test.js — /app is the PRODUCT's surface, not the coaching
// site's (arc A, ruling 1). The trigger: Sam signed in from the Crads-AI app
// and landed in a sidebar offering "Book a session" and "Packs". These pins
// exist so the two shells can never converge again.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { renderAppShell, renderAppNav, NAV } = require('../lib/appShell');

const ROOT = join(__dirname, '..');
const APP_API = join(ROOT, 'api', 'app');

test('the shell carries the app language, never the site stylesheet', () => {
  const html = renderAppShell({ title: 'Minerals', active: 'minerals', email: 'sam@x.com', main: '<p>hi</p>' });
  assert.ok(!html.includes('/lib/site.css'), 'the coaching stylesheet never loads here');
  assert.ok(html.includes('--accent:#A4582C'), 'the app palette is inline');
  assert.ok(html.includes('prefers-color-scheme: dark'), 'both themes');
  assert.ok(html.includes('crads<i>-ai</i>'), 'the product mark, not "Sam Davis."');
  assert.ok(html.includes('name="robots" content="noindex"'), 'a gated surface stays out of search');
  assert.ok(html.includes('<p>hi</p>'), 'main content renders');
});

test('the nav is the four things an account holds, and marks where you are', () => {
  assert.deepEqual(NAV.map((n) => n.label), ['Minerals', 'Devices', 'Billing', 'Account']);
  const nav = renderAppNav('devices');
  assert.ok(/href="\/app\/devices" class="on"/.test(nav), 'the active item is marked');
  assert.ok(/href="\/app\/minerals" class=""/.test(nav), 'the others are not');
  for (const gone of ['Book a session', 'Packs', 'Subscription', 'Sessions']) {
    assert.ok(!nav.includes(gone), `the coaching nav item "${gone}" has no place here`);
  }
});

test('identity and title are escaped: neither can break out of the page', () => {
  const html = renderAppShell({
    title: '</title><script>alert(1)</script>',
    active: 'account', email: '<img src=x onerror=alert(1)>', main: '',
  });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'the title cannot open a script');
  assert.ok(!html.includes('<img src=x'), 'nor can the email');
  assert.ok(html.includes('&lt;script&gt;'), 'it is escaped, not stripped');
});

test('sign-out posts to the one real logout endpoint', () => {
  const html = renderAppShell({ title: 'x', active: 'minerals', email: 'a@b.c', main: '' });
  assert.ok(html.includes('action="/api/auth/logout" method="POST"'), 'the existing endpoint, not a new one');
});

test('anti-drift: every /api/app handler renders through the app shell, never renderShell', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? walk(join(dir, e.name)) : (e.name.endsWith('.js') ? [join(dir, e.name)] : [])
  ));
  assert.ok(existsSync(APP_API), 'api/app exists');
  const files = walk(APP_API);
  assert.ok(files.length > 0, 'there are handlers to check');
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/renderShell/.test(src), `${f} reaches for the coaching shell`);
    assert.ok(!/lib\/site\.css/.test(src), `${f} pulls in the coaching stylesheet`);
    assert.ok(/requireAuth/.test(src), `${f} is not gated`);
  }
});

test('the /app routes are actually reachable: vercel.json rewrites them', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const map = new Map(cfg.rewrites.map((r) => [r.source, r.destination]));
  assert.equal(map.get('/app'), '/api/app', 'the root of the app');
  for (const n of NAV) {
    assert.equal(map.get(n.href), `/api/app/${n.route}`, `${n.href} is rewritten`);
  }
});

test('times localise for the reader; the server text is never an unlabelled UTC clock', () => {
  const { renderTime } = require('../lib/appShell');
  const html = renderTime('2026-08-10T08:39:00.000Z');
  assert.ok(html.includes('data-iso="2026-08-10T08:39:00.000Z"'), 'the browser is given the real instant');
  assert.ok(html.includes('08:39 UTC'), 'and the no-JS fallback names its zone');
  assert.equal(renderTime(''), 'unknown', 'a missing time says so');
  // the shell carries the rewriter
  const shell = renderAppShell({ title: 'x', active: 'devices', email: 'a@b.c', main: renderTime('2026-08-10T08:39:00.000Z') });
  assert.ok(shell.includes('time[data-iso]'), 'and the page knows how to localise it');
});

test('the account never states something it cannot know', () => {
  const billing = readFileSync(join(ROOT, 'api', 'app', 'billing.js'), 'utf8');
  assert.ok(!/does not operate a rock/.test(billing),
    'claiming "no rock" is false for every rock owner: a rock records no owner, so this is unknowable');
  assert.match(billing, /not listed here yet/, 'the limitation is stated instead');
  const minerals = readFileSync(join(ROOT, 'api', 'app', 'minerals.js'), 'utf8');
  assert.match(minerals, /incomplete rather than wrong/, 'an empty list explains what it cannot see');
  assert.match(minerals, /Rocks you operate yourself are not listed here yet/, 'including the rock gap');
});
