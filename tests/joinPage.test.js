'use strict';
// joinPage.test.js — the /join landing page, driven rather than read.
//
// This is the first screen a member sees after the welcome email, and until the
// live QA run of 2026-08-16 nothing tested it at all. Two of that run's findings
// were pure copy on this page, and neither is visible to a plain string check,
// because the page rewrites its own lines at runtime depending on whether the
// pebble is anchored to a rock:
//
//   140  one invite link carried three different expiry promises. The email said
//        48 hours, this page said "works until you use it", the repo's copy of
//        this page said 14 days, and the only expiry any code enforces is
//        CLAIM_TTL_MS (48h) in cockpit/jobs/enrol-arrivals.mjs, which refuses an
//        older claim outright. The member read the email and the very next screen
//        contradicted it.
//   142  the page said "choose Join". The app's door has "I have an invitation"
//        and, separately, "Join a community", which wants a rock handle and not an
//        invite link. The one word pointed at the one screen the link cannot answer.
//
// So the test evaluates the page's own inline script against a stub DOM and reads
// back what a member would have seen, once as a standalone pebble and once as a
// pebble anchored to a rock.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'join', 'index.html'), 'utf8');
// Copy assertions read the page WITHOUT its comments: the comments record what the
// wrong copy used to say, and a test that read them would fail on its own history.
const VISIBLE = PAGE.replace(/<!--[\s\S]*?-->/g, '');

const shipped = (re) => (VISIBLE.match(re) || [])[1] || '';
const STEP3_HTML = shipped(/<li id="step3">([\s\S]*?)<\/li>/);
const EXPIRY_TEXT = shipped(/<p class="fine" id="expiry">([\s\S]*?)<\/p>/);

function el(initial) {
  return Object.assign({
    style: {}, innerHTML: '', textContent: '', value: '', href: '', firstChild: null,
    addEventListener() {}, removeEventListener() {}, insertBefore() {}, appendChild() {},
    focus() {}, select() {},
  }, initial || {});
}

function render(fragment) {
  const src = (PAGE.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  assert.ok(src, 'found the inline script');
  const ids = ['opening', 'fallback', 'badlink', 'orgline', 'orgline2', 'dlBtn', 'copyBtn',
    'retry', 'pasteLink', 'pasteMsg', 'badwhy', 'openAnyway'];
  const dom = {};
  ids.forEach((id) => { dom[id] = el(); });
  // the two rows the script REWRITES rather than fills: the stub starts holding
  // what the HTML ships, or "left alone" and "blank" look the same
  dom.step3 = el({ innerHTML: STEP3_HTML });
  dom.expiry = el({ textContent: EXPIRY_TEXT });
  const ctx = vm.createContext({
    document: {
      getElementById: (id) => dom[id] || null,
      createElement: () => el(),
      addEventListener() {}, removeEventListener() {},
      hidden: false, body: { appendChild() {}, removeChild() {} },
    },
    location: { hash: '#' + fragment, href: '', pathname: '/join', replace() {}, reload() {} },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' },
    setTimeout: () => 0,
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
  });
  vm.runInContext(src, ctx);
  return { dom, handedToApp: ctx.location.href };
}

const mk = (lane, slug, fields) => 'v1.' + lane + '.' + slug + '.'
  + Buffer.from(fields.join('|'), 'utf8').toString('base64url');

// exactly what cockpit/jobs/fulfil-arrivals.mjs mints for a rock-stamped pebble:
// lane crads-solo, the real anchor in payload field 7
const ANCHORED = mk('crads-solo', 'qa-member-five',
  ['qa-member-five.crads-ai.com', '178.105.231.90', 'member', 'tok', '', '', 'qa-r2-gmail']);
const SOLO = mk('crads-solo', 'solo-one', ['solo-one.crads-ai.com', '1.2.3.4', 'member', 'tok', '', '', '']);

test('140: a standalone pebble is promised the 48 hours the claim TTL enforces', () => {
  const { dom } = render(SOLO);
  assert.match(dom.expiry.textContent, /good for 48 hours/);
  assert.ok(!/14 days/.test(VISIBLE), 'nothing the member reads promises an expiry no code enforces');
  assert.ok(!/works until you use it/.test(dom.expiry.textContent),
    'the page must not outlive the claim TTL in its own copy');
});

test('140: an anchored pebble gets the same 48 hours plus the revoke caveat', () => {
  const { dom } = render(ANCHORED);
  assert.match(dom.expiry.textContent, /48 hours/);
  assert.match(dom.expiry.textContent, /revoke it sooner/);
});

test('142: the page names a button the door actually has', () => {
  assert.match(VISIBLE, /choose <b>I have an invitation<\/b>/);
  assert.ok(!/choose <b>Join<\/b>/.test(VISIBLE), '"Join a community" is a different screen');
});

test('136 stays fixed: an anchored pebble keeps its sign-in step, a solo one does not', () => {
  // The regression guard for the fix this page already carries. The lane says
  // crads-solo on EVERY invite, anchored or not, so reading it as "no
  // organisation" silently strips sign-in from every rock-anchored pebble.
  assert.match(render(ANCHORED).dom.step3.innerHTML, /Sign in with the email address/);
  assert.match(render(SOLO).dom.step3.innerHTML, /no password, no sign-in/);
  assert.strictEqual(render(ANCHORED).handedToApp, 'crads-ai://join/' + ANCHORED,
    'and the invite still reaches the app whole');
});
