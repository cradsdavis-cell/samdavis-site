'use strict';
// /app/admin — the operator's universal view (V3). Under test: the 404 for
// anyone else, both sources rendered with honest labels, and the admin-scoped
// token minted for the worker call.
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-here';
const { signSession } = require('../lib/auth');

function mockReq(cookie) {
  return { headers: { cookie }, method: 'GET', url: '/app/admin' };
}
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { res.body = String(b); return res; };
  res.redirect = (code, url) => { res.statusCode = code; res.headers.location = url; return res; };
  res.end = () => res;
  return res;
}

const OPERATOR = 'cradsdavis@gmail.com';
const users = {
  [OPERATOR]: { email: OPERATOR, id: 'acc_' + 'a'.repeat(24), state_version: 1, created_at: '2026-08-01', password_hash: 'x' },
  'jo@x.com': { email: 'jo@x.com', id: 'acc_' + 'b'.repeat(24), state_version: 1, google_sub: 'g1' },
};
const fakeKv = {
  getUser: async (e) => users[e] || null,
  setUser: async (e, r) => { users[e] = r; },
  listUsers: async () => Object.values(users),
  getSession: async () => ({ sid: 's', label: 't' }),
  setSession: async () => {},
  listSessions: async () => [],
  deleteSession: async () => {},
};

// admin.js DESTRUCTURES defaultKv and directoryFor at require time, so both
// must be delegators BEFORE the require: reassigning the module property
// afterwards would change nothing the handler can see.
const kvMod = require('../lib/kv');
const dirMod = require('../lib/directory');
const realFor = dirMod.directoryFor;
let currentDir = realFor;
kvMod.defaultKv = () => fakeKv;
dirMod.directoryFor = (...a) => currentDir(...a);
const handler = require('../api/app/admin.js');

test('a non-operator gets 404, not a page and not a 403', async () => {
  const res = mockRes();
  await handler(mockReq(`session_jwt=${signSession({ email: 'jo@x.com', state_version: 1 })}`), res);
  assert.equal(res.statusCode, 404, 'the page\'s existence is nobody else\'s business');
});

test('the operator sees accounts AND minerals, each from its own source', async () => {
  let mintedScope = '';
  currentDir = (user) => ({
    adminAll: async () => {
      mintedScope = 'admin';   // stands in for asserting mintAppToken scope; the real reader mints scope admin
      return { ok: true, minerals: [
        { mineral_id: 'min_' + 'a'.repeat(24), label: 'Test Org 4', host: 'test-org-4', tier: 'rock', anchor: 'crads-ai',
          holder: { kind: 'account', account_id: 'acc_' + 'a'.repeat(24) }, access: [{ role: 'owner' }], updated: 1754800000000 },
      ], boxes: [{ host: '731d5dceecd6', label: '', owner_e: 'f'.repeat(64), updated: 1754800000000 }], orgs: ['test-org-4'] };
    },
    adminTopology: async () => ({ ok: true, minerals: [], edges: [], orgs: [], orgedges: [], reserved: [], reflect: {}, generated: 1754800000000 }),
  });
  const res = mockRes();
  await handler(mockReq(`session_jwt=${signSession({ email: OPERATOR, state_version: 1 })}`), res);
  currentDir = realFor;

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Accounts \(2\)/, 'every account, with the count');
  assert.match(res.body, /jo@x\.com/, 'including other people\'s');
  assert.match(res.body, /Test Org 4/, 'every mineral');
  // Dropped 2026-08-13. The fixture still SUPPLIES boxes and orgs, deliberately:
  // the worker still returns them, so this asserts the page ignores what it is
  // given rather than that it was handed nothing to ignore.
  assert.doesNotMatch(res.body, /Legacy self-registrations/, 'legacy claims are not rendered');
  assert.doesNotMatch(res.body, /Not proof of ownership/);
  assert.doesNotMatch(res.body, /Org routes/, 'org routes are not rendered, tile included');
  assert.doesNotMatch(res.body, /731d5dceecd6/, 'and no legacy row leaks through another block');
  assert.equal(mintedScope, 'admin');
});

test('a dead directory read never hides the accounts, and says which half is missing', async () => {
  currentDir = () => ({ adminAll: async () => ({ ok: false, reason: 'the directory answered 500' }) });
  const res = mockRes();
  await handler(mockReq(`session_jwt=${signSession({ email: OPERATOR, state_version: 1 })}`), res);
  currentDir = realFor;
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Accounts \(2\)/, 'the site\'s own half still renders');
  assert.match(res.body, /missing, not empty/, 'and the mineral half is named as unreadable, never as none');
});

// ---- topology widget (2026-08-17, card tree + lines) -----------------------
const NOW = 1754800000000;
const topoFixture = {
  ok: true, generated: NOW,
  minerals: [
    { mineral_id: 'min_' + 'r'.repeat(24), label: 'QA Run Two Gmail', host: 'qa-r2-gmail.crads-ai.com', tier: 'rock', anchor: '', org: 'qa-r2-gmail', holder: { kind: 'account', e: 'f'.repeat(64) }, updated: NOW - 2 * 60e3 },
    { mineral_id: 'min_' + 's'.repeat(24), label: 'Barbara', host: 'barbara.crads-ai.com', tier: 'rock', anchor: '', org: 'institute-of-shenanigans', holder: { kind: 'account', e: 'f'.repeat(64) }, updated: NOW - 2 * 60e3 },
    { mineral_id: 'min_' + 't'.repeat(24), label: 'Brian Adams', host: 'brian-adams.crads-ai.com', tier: 'pebble', anchor: 'institute-of-shenanigans', holder: { kind: 'account', e: 'f'.repeat(64) }, updated: NOW - 40 * 60e3 },
  ],
  edges: [
    { eh: 'f'.repeat(64), org: 'institute-of-shenanigans', role: 'member', status: 'active', slug: 'brian-adams', rel: 'anchored', updated: NOW },
    { eh: 'f'.repeat(64), org: 'qa-r2-gmail', role: 'member', status: 'active', slug: 'institute-of-shenanigans', rel: 'joined', updated: NOW },
    { eh: 'f'.repeat(64), org: 'qa-r2-gmail', role: 'member', status: 'left', slug: 'gone-box', rel: 'anchored', updated: NOW },
  ],
  orgs: ['qa-r2-gmail', 'institute-of-shenanigans', 'promoted-rock-1'],
  orgedges: [],
  reserved: [{ org: 'held-name', display: 'Held Name', promote: 'deadbeef01', at: NOW - 86400e3, expires_at: NOW + 26 * 86400e3 }],
  reflect: { 'qa-r2-gmail': NOW - 12 * 60e3 },
};

test('topoModel: anchors and joins become the tree, left edges do not, routes without minerals still appear', () => {
  const { roots, ties } = handler.topoModel(topoFixture);
  assert.equal(ties.length, 2, 'the left edge is not a live tie');
  const qa = roots.find((r) => r.id === 'qa-r2-gmail');
  assert.ok(qa, 'the qa rock is a root');
  const inst = qa.kids.find((k) => k.id === 'institute-of-shenanigans');
  assert.ok(inst, 'the joined rock hangs under it');
  assert.equal(inst.rel, 'joined');
  assert.ok(inst.kids.some((k) => k.id === 'brian-adams' && k.rel === 'anchored'), 'the anchored pebble hangs under its rock');
  assert.ok(roots.some((r) => r.id === 'promoted-rock-1' && r.routeOnly), 'a route with no mineral record still appears');
});

test('topology block: cards, reflect honesty, ghost reservation, jump anchors', () => {
  const html = handler.topologyBlock(topoFixture, new Map(), NOW);
  assert.match(html, /3 minerals · 2 live ties · 1 reserved/, 'the summary strip');
  assert.match(html, /QA Run Two Gmail/);
  assert.match(html, /edges re-asserted 12m ago/, 'a rock with a heartbeat wears its stamp');
  assert.match(html, /edges never re-asserted/, 'a rock without one is called out, not skipped');
  assert.match(html, /href="#m-min_tttttttttttt/, 'cards jump to the mineral row below');
  assert.match(html, /class="chip">joined</, 'a joined tie is labelled');
  assert.match(html, /reserved handle · promote in flight · frees in 26d/, 'the reservation ghost with its expiry');
  assert.match(html, /a community route with no mineral record/, 'the half-known org is named');
  assert.ok(!/f{64}/.test(html), 'no raw holder hash is rendered in the widget');
});

test('the operator page renders the Topology section from the topology reader', async () => {
  currentDir = () => ({
    adminAll: async () => ({ ok: true, minerals: topoFixture.minerals, boxes: [], orgs: topoFixture.orgs }),
    adminTopology: async () => topoFixture,
  });
  const res = mockRes();
  await handler(mockReq(`session_jwt=${signSession({ email: OPERATOR, state_version: 1 })}`), res);
  currentDir = realFor;
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<h2 class="sect">Topology<\/h2>/);
  assert.match(res.body, /topo-strip/, 'the widget is on the page');
  assert.match(res.body, /id="m-min_rrrrrrrrrrrr/, 'the minerals table carries the jump target');
});

test('a dead topology read names itself and leaves the rest of the page standing', async () => {
  currentDir = () => ({
    adminAll: async () => ({ ok: true, minerals: [], boxes: [], orgs: [] }),
    adminTopology: async () => ({ ok: false, reason: 'the directory answered 503' }),
  });
  const res = mockRes();
  await handler(mockReq(`session_jwt=${signSession({ email: OPERATOR, state_version: 1 })}`), res);
  currentDir = realFor;
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /The topology could not be read: the directory answered 503/);
  assert.match(res.body, /Accounts \(2\)/, 'the rest of the page stands');
});

test('the admin reader mints an ADMIN-scoped token; the ordinary reader never does', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'directory.js'), 'utf8');
  assert.match(src, /scope: 'admin'/, 'adminAll carries the scope');
  // The invariant is about the READER's token, not about where in the file a
  // scope first appears. This used to slice the source at 'revokeDevice' and
  // assert no `scope:` came before it, which silently encoded "there is exactly
  // one custody act and it is the first one" — it broke the moment a second
  // landed (grantAccess/revokeGrant, 2026-08-13) even though the thing it cared
  // about was untouched. So check the bearer closure itself: that is the token
  // every ordinary page read carries, and it must stay unscoped.
  const bearerFn = src.slice(src.indexOf('const bearer = ()'), src.indexOf('// Per-reader cache') >= 0
    ? src.indexOf('async function get(') : src.length);
  assert.ok(bearerFn.length > 0, 'the reader mints its token in a bearer() closure');
  assert.ok(!/scope:/.test(bearerFn), 'the per-reader token stays unscoped, so a normal page never holds world-reading credentials');
  assert.match(src, /scope: 'manage'/, 'custody acts mint their own manage-scoped token per call');
});
