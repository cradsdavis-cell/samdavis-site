'use strict';
// tests/appMinerals.test.js — the account's read path into the directory
// (arc A, A2). The contract: the site mints its own app token and calls the
// worker server-side, the two views merge into one row per mineral, and a
// failed read is NEVER rendered as "you have none".
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
const crypto = require('crypto');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.APP_TOKEN_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.APP_TOKEN_KID = 'test-kid-1';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { directoryFor, mergeMinerals, emailHash } = require('../lib/directory');

const USER = { email: 'Sam@X.com', state_version: 3 };
const EH = emailHash('sam@x.com');

function fakeFetcher(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, search: u.search, auth: (init.headers || {}).authorization || '' });
    const r = routes[u.pathname];
    if (!r) return { ok: false, status: 404, json: async () => ({}) };
    if (typeof r === 'function') return r();
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.body || {} };
  };
  f.calls = calls;
  return f;
}

test('the reader mints a real app token and asks for its OWN hash', async () => {
  const fetcher = fakeFetcher({ '/edges': { body: { edges: [] } } });
  const dir = directoryFor(USER, { fetcher, baseUrl: 'https://dir.test' });
  await dir.edges();
  const call = fetcher.calls[0];
  assert.equal(call.search, `?e=${EH}`, 'the email hash is lowercased before hashing');
  const token = call.auth.replace('Bearer ', '');
  const claims = jwt.decode(token);
  assert.equal(claims.iss, 'https://crads-ai.com', 'minted by this site');
  assert.equal(claims.aud, 'crads-directory', 'for the directory');
  assert.equal(claims.email, 'sam@x.com');
  assert.equal(claims.sv, 3, 'the live state_version rides, so a password change cuts it');
  assert.ok(!claims.scope, 'a plain read token, never enrol-scoped');
});

test('one token serves the whole page, and each route is asked once', async () => {
  const fetcher = fakeFetcher({
    '/edges': { body: { edges: [] } },
    '/my-boxes': { body: { boxes: [] } },
  });
  const dir = directoryFor(USER, { fetcher, baseUrl: 'https://dir.test' });
  await Promise.all([dir.edges(), dir.boxes()]);
  await dir.edges();   // second read of the same view
  assert.equal(fetcher.calls.length, 2, 'the repeat read was cached');
  assert.equal(fetcher.calls[0].auth, fetcher.calls[1].auth, 'one token per reader');
});

test('failure is shaped, never thrown: unreachable, refused, and unreadable each say so', async () => {
  const dead = directoryFor(USER, { fetcher: async () => { throw new Error('ENOTFOUND'); }, baseUrl: 'https://dir.test' });
  const r1 = await dead.edges();
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /could not be reached/);

  const refused = directoryFor(USER, { fetcher: fakeFetcher({ '/edges': { status: 401 } }), baseUrl: 'https://dir.test' });
  const r2 = await refused.edges();
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /did not accept/);

  const junk = directoryFor(USER, { fetcher: fakeFetcher({ '/edges': () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) }), baseUrl: 'https://dir.test' });
  const r3 = await junk.edges();
  assert.equal(r3.ok, false);
  assert.match(r3.reason, /unreadable/);
});

test('the merge: one row per mineral, ties and registrations joined on the handle', () => {
  const rows = mergeMinerals({
    edges: [
      { org: 'test-org-4', org_display: 'Test Org 4', role: 'member', status: 'active', slug: 'keith', rel: 'anchored', box: 'keith-box', tier: 'pebble' },
      { org: 'club', role: 'member', status: 'active', slug: 'keith', rel: 'joined' },
      { org: 'test-org-4', role: 'admin', status: 'active', slug: 'sam' },
    ],
    boxes: [
      { host: 'keith-box', label: 'Keith', ssh: { hostname: '1.2.3.4', user: 'aios', port: 22 } },
      { host: 'solo-pebble', label: 'My own', ssh: {} },
    ],
  });
  const byName = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.ok(byName.keith, 'the tie and the registration are ONE row, not two');
  assert.equal(byName.keith.tie, 'joined', 'later edge wins the row, both are the same mineral');
  assert.equal(byName.keith.registered, true, 'and it carries the registration');
  assert.equal(byName.keith.ssh.user, 'aios');
  assert.ok(byName['solo-pebble'], 'a registered mineral with no tie still appears');
  assert.equal(byName['solo-pebble'].tie, '', 'and claims no relationship it does not have');
  assert.ok(!rows.some((r) => r.key === 'sam'), 'an ADMIN edge is not a mineral');
});

test('org_display falls back to the handle: the worker omits it when empty', () => {
  const [row] = mergeMinerals({ edges: [{ org: 'acme', role: 'member', slug: 'x', rel: 'anchored' }] });
  assert.equal(row.orgDisplay, 'acme', 'never a blank where a name should be');
});

test('the page tells empty apart from unreadable', () => {
  // Read the source rather than booting the handler: requiring it constructs a
  // real Redis client (defaultKv) whose reconnect loop keeps the test runner
  // alive forever. The branch ORDER is the guarantee worth pinning anyway.
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'app', 'minerals.js'), 'utf8');
  assert.match(src, /requireAuth/, 'gated before anything renders');
  assert.match(src, /Could not read your minerals just now/, 'unreadable says so');
  assert.match(src, /Nothing to show for this account yet/, 'empty says so');
  assert.match(src, /can REACH|can reach/, 'and the page filters on access, not ownership');
  assert.ok(src.indexOf('Could not read your minerals') < src.indexOf('Nothing to show for this account yet'),
    'the failure branch is checked BEFORE the empty branch, so a dead read can never render as none');
  assert.match(src, /incomplete rather than wrong/,
    'and empty explains what the account cannot see, rather than implying the user has nothing');
  assert.match(src, /registered itself/, 'a registration is a claim, not proof of ownership');
});

// ---- the list filters on ACCESS, ownership is an attribute (ruling 9) --------
test('the mirror is the authority; ties enrich it; a legacy self-registration is marked as a claim', () => {
  const { assemble } = require('../api/app/minerals.js');
  const rows = assemble({
    minerals: [
      { mineral_id: 'min_' + 'a'.repeat(24), label: 'keith', host: 'keith.crads-ai.com', tier: 'pebble', role: 'owner', held_by: 'you' },
      { mineral_id: 'min_' + 'b'.repeat(24), label: 'shared-one', host: 'shared.example', tier: 'pebble', role: 'user', held_by: 'Acme' },
    ],
    edges: [{ org: 'test-org-4', org_display: 'Test Org 4', role: 'member', status: 'active', slug: 'keith', rel: 'anchored', box: 'keith-box' }],
    boxes: [{ host: 'old-thing', label: 'Old Thing' }],
  });
  // every source's handle for the same machine reduces to one key
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(rows.length, 3, 'two mirrored minerals + one legacy claim; the tie made no fourth row');
  assert.equal(by.keith.role, 'owner');
  assert.equal(by.keith.held_by, 'you');
  assert.equal(by.keith.tie, 'anchored', 'the tie layer enriched the same row rather than making a second');
  assert.equal(by.keith.orgDisplay, 'Test Org 4');
  assert.ok(!by.keith.legacy, 'a mineral in the mirror is not a mere claim');
  assert.equal(by.shared.role, 'user', 'THE COMPANY CASE: held by Acme, reachable by this account, and it appears');
  assert.equal(by['old-thing'].legacy, true, 'a self-registration with no mirror row is flagged as a claim');
});

test('a mineral held by a company still appears — that is the whole point of filtering on access', () => {
  const { assemble } = require('../api/app/minerals.js');
  const rows = assemble({ minerals: [{ mineral_id: 'min_' + 'c'.repeat(24), label: 'work-pebble', tier: 'pebble', role: 'user', held_by: 'Acme Ltd' }] });
  assert.equal(rows.length, 1, 'ownership is not the filter');
  assert.equal(rows[0].held_by, 'Acme Ltd');
});

test('the page renders held-by in words, and never as a bare id', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'app', 'minerals.js'), 'utf8');
  assert.match(src, /held by you/, 'yours');
  assert.match(src, /shared with you/, 'and someone else\'s');
  assert.ok(!/held_by\}\)/.test(src.replace(/escapeHtml\(m\.held_by[^)]*\)/g, '')), 'the raw value is never printed unescaped');
  assert.match(src, /can reach/, 'the lead says access, not ownership');
});

test('one mineral is ONE row, whichever sources describe it', () => {
  const { assemble } = require('../api/app/minerals.js');
  const rows = assemble({
    minerals: [{ mineral_id: 'min_' + 'f'.repeat(24), label: 'Janet', host: 'b8e8f5d2d097', tier: 'pebble', role: 'owner', held_by: 'you' }],
    boxes: [{ host: 'b8e8f5d2d097', label: 'Janet' }],
  });
  assert.equal(rows.length, 1, 'the mirror and the legacy registration are the same mineral, not two');
  assert.ok(!rows[0].legacy, 'and it is described by the authority, not flagged as a mere claim');
});

test('a container id is never shown as a name', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'app', 'minerals.js'), 'utf8');
  assert.match(src, /CONTAINER_ID/, 'the shape is recognised');
  assert.match(src, /an unnamed rock/, 'and an unnamed mineral says so plainly rather than showing a docker id');
  assert.ok(src.indexOf('String(m.host) !== title') > -1, 'the address is never printed as both heading and subtitle');
});

test('an ended tie reads as English, and a placeholder reason is not printed', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'app', 'minerals.js'), 'utf8');
  assert.match(src, /'anchor' : \(n\.tie/, '"your anchored here ended" was not a sentence');
  assert.match(src, /no reason\$\/i/, 'and "No Reason" is a placeholder, not a reason worth printing');
});
