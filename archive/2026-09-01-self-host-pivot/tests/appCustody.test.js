'use strict';
// tests/appCustody.test.js: the mineral's answer reaches the member
// (findings 144, 162 and 163, 2026-08-16).
//
// WHAT THESE PIN. `/revoke-consume` and `/grant-consume` wrote the mineral's own
// outcome and its own words for it from the day they were built, and had ZERO
// readers anywhere. `/custody-status` was then built to serve them and shipped
// with zero callers, so nothing changed for the member: Remove was pressed, the
// mineral refused with a good reason, and ten minutes later the page read
// "1 machine" with no explanation and Recent changes had no row.
//
// EVERY TEST HERE FAILS ON THE COMMIT BEFORE THIS ONE, and that was checked by
// running them against it rather than assumed: lib/custodyOutcomes.js did not
// exist, directoryFor had no custodyStatus, device-remove read nothing before
// asking, and activity.js had two sources.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
const crypto = require('crypto');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.APP_TOKEN_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.APP_TOKEN_KID = 'test-kid-1';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { signSession } = require('../lib/auth');
const { directoryFor, emailHash } = require('../lib/directory');
const { canReadCustody, custodyRows, lastDeviceOutcome, OUTCOME_NOTE } = require('../lib/custodyOutcomes');

const MID = 'min_' + 'a'.repeat(24);
const USER = { email: 'Member@X.com', state_version: 4, id: 'acc_' + 'b'.repeat(24) };
const ME = { hash: emailHash('member@x.com'), id: USER.id };

// The exact words the live mineral used on 2026-08-16, kept verbatim because
// the whole point of this work is that the box's sentence is what a person reads.
const REFUSAL = 'this is the last key that can open this mineral, so removing it '
  + 'would lock everyone out; add another computer first, then remove this one';

function fakeFetcher(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, search: u.search, method: init.method || 'GET', auth: (init.headers || {}).authorization || '' });
    const r = routes[u.pathname];
    if (!r) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    const v = typeof r === 'function' ? r() : r;
    return { ok: (v.status || 200) < 400, status: v.status || 200, json: async () => v.body || {} };
  };
  f.calls = calls;
  return f;
}

// ---- the reader -----------------------------------------------------------

test('custodyStatus mints a MANAGE-scoped token, because the worker demands one', async () => {
  const fetcher = fakeFetcher({ '/custody-status': { body: { ok: true, host: 'six.crads-ai.com' } } });
  const dir = directoryFor(USER, { fetcher, baseUrl: 'https://dir.test' });
  await dir.custodyStatus(MID);
  const call = fetcher.calls[0];
  assert.equal(call.path, '/custody-status');
  assert.equal(call.search, `?mineral_id=${MID}`);
  const claims = jwt.decode(call.auth.replace('Bearer ', ''));
  assert.equal(claims.scope, 'manage', 'a read must not be easier than the write it reports on');
  assert.equal(claims.aid, USER.id, 'the account id rides, which is what the holder check compares');
});

test('the manage token never lands in the cache the plain page reads share', async () => {
  const fetcher = fakeFetcher({
    '/custody-status': { body: { ok: true, host: 'six.crads-ai.com' } },
    '/my-minerals': { body: { minerals: [] } },
  });
  const dir = directoryFor(USER, { fetcher, baseUrl: 'https://dir.test' });
  await dir.custodyStatus(MID);
  await dir.minerals();
  const [custody, minerals] = fetcher.calls;
  assert.notEqual(custody.auth, minerals.auth, 'two different tokens');
  assert.ok(!jwt.decode(minerals.auth.replace('Bearer ', '')).scope, 'the ordinary page read stays unscoped');
});

test('a 403 is reported as a 403, never as "nothing happened"', async () => {
  const fetcher = fakeFetcher({ '/custody-status': { status: 403, body: { error: 'only the holder or an admin of this mineral can read its custody outcomes' } } });
  const dir = directoryFor(USER, { fetcher, baseUrl: 'https://dir.test' });
  const r = await dir.custodyStatus(MID);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403, 'the caller can tell "not yours to see" from "the directory is down"');
  assert.match(r.reason, /holder or an admin/);
});

test('an admin who is not the holder gets no devices half, and reading it does not throw', async () => {
  // The worker omits `devices` entirely unless the caller HOLDS the mineral.
  const fetcher = fakeFetcher({ '/custody-status': { body: { ok: true, host: 'h', access: { pending: [], outcomes: [] } } } });
  const dir = directoryFor(USER, { fetcher, baseUrl: 'https://dir.test' });
  const r = await dir.custodyStatus(MID);
  assert.deepEqual(r.devices, { pending: [], outcomes: [] }, 'normalised to a present, empty half');
  assert.equal(lastDeviceOutcome(r, 'second-brain'), null);
});

// ---- the gate -------------------------------------------------------------

test('canReadCustody mirrors the worker: holder yes, active admin yes, pending admin no', () => {
  assert.equal(canReadCustody({ mineral_id: MID, host: 'h', held_by: 'you' }, ME), true);
  assert.equal(canReadCustody({ mineral_id: MID, host: 'h', access: [{ role: 'admin', status: 'active', e: ME.hash }] }, ME), true);
  assert.equal(canReadCustody({ mineral_id: MID, host: 'h', access: [{ role: 'admin', status: 'pending', e: ME.hash }] }, ME), false,
    'an invitation nobody has accepted is not a permission');
  assert.equal(canReadCustody({ mineral_id: MID, host: 'h', access: [{ role: 'member', status: 'active', e: ME.hash }] }, ME), false);
  assert.equal(canReadCustody({ mineral_id: MID, host: '', held_by: 'you' }, ME), false,
    'no host means the worker 409s, so do not spend the round trip');
});

// ---- the words ------------------------------------------------------------

test('a refusal is rendered in the MINERAL’s words, unedited', () => {
  const rows = custodyRows({
    status: { ok: true, devices: { pending: [], outcomes: [{ slug: 'second-brain', outcome: 'refused', reason: REFUSAL, at: 100 }] }, access: { pending: [], outcomes: [] } },
    mineralName: 'QA Member Six',
    deviceLabels: new Map([['second-brain', 'second-brain']]),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'QA Member Six refused to remove second-brain');
  assert.equal(rows[0].reason, REFUSAL, 'not paraphrased, not truncated, not softened');
});

test('both halves are carried, because it was one defect in two key shapes', () => {
  const rows = custodyRows({
    status: {
      ok: true,
      devices: { pending: [{ slug: 'laptop', at: 5 }], outcomes: [{ slug: 'old-mac', outcome: 'applied', at: 6 }] },
      access: {
        pending: [{ e: 'f'.repeat(64), email: 'jo@x.com', action: 'grant', at: 7 }],
        outcomes: [{ e: 'e'.repeat(64), email: 'kim@x.com', action: 'revoke', outcome: 'refused', reason: 'that account holds this mineral', at: 8 }],
      },
    },
    mineralName: 'Six',
  });
  const titles = rows.map((r) => r.title);
  assert.deepEqual(titles, [
    'Waiting for Six to remove laptop',
    'old-mac was removed from Six',
    'Waiting for Six to give jo@x.com access',
    'Six refused to take kim@x.com’s access away',
  ]);
  assert.equal(rows[3].reason, 'that account holds this mineral');
});

test('an address the site cannot name is named as unresolved, never printed as a hash', () => {
  const rows = custodyRows({
    status: { ok: true, devices: { pending: [], outcomes: [] }, access: { pending: [], outcomes: [{ e: 'c'.repeat(64), outcome: 'refused', reason: 'no such account', at: 1 }] } },
    mineralName: 'Six',
  });
  assert.match(rows[0].title, /an account not on this site/);
  assert.doesNotMatch(rows[0].title, /cccc/);
});

test('the overwrite (finding 163) is stated, not hidden', () => {
  assert.match(OUTCOME_NOTE, /24 hours/);
  assert.match(OUTCOME_NOTE, /most recent attempt/);
  assert.match(OUTCOME_NOTE, /replaces the first/);
});

// ---- the Remove button ----------------------------------------------------

const kvMod = require('../lib/kv');
const dirMod = require('../lib/directory');
const realFor = dirMod.directoryFor;
let currentDir = realFor;
const users = { 'member@x.com': { ...USER, email: 'member@x.com', created_at: '2026-08-01', password_hash: 'x' } };
kvMod.defaultKv = () => ({
  getUser: async (e) => users[e] || null,
  setUser: async (e, r) => { users[e] = r; },
  listUsers: async () => Object.values(users),
  getSession: async () => ({ sid: 's', label: 't' }),
  setSession: async () => {},
  listSessions: async () => [],
  deleteSession: async () => {},
  listInvites: async () => [],
});
dirMod.directoryFor = (...a) => currentDir(...a);
const removeHandler = require('../api/app/device-remove.js');
const activityHandler = require('../api/app/activity.js');

const COOKIE = `session_jwt=${signSession({ email: 'member@x.com', state_version: 4 })}`;
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { res.body = String(b); return res; };
  res.redirect = (c, u) => { res.statusCode = c; res.headers.location = u; return res; };
  res.end = () => res;
  return res;
}
function postReq(body) {
  return { headers: { cookie: COOKIE }, method: 'POST', url: '/api/app/device-remove', body };
}

test('pressing Remove after a refusal shows the mineral’s own words', async () => {
  let asked = 0;
  currentDir = () => ({
    custodyStatus: async () => ({
      ok: true,
      devices: { pending: [], outcomes: [{ slug: 'second-brain', outcome: 'refused', reason: REFUSAL, at: Date.now() - 6e5 }] },
      access: { pending: [], outcomes: [] },
    }),
    revokeDevice: async () => { asked += 1; return { ok: true, note: 'the mineral applies this itself, usually within a couple of minutes' }; },
  });
  const res = mockRes();
  await removeHandler(postReq({ mineral_id: MID, slug: 'second-brain' }), res);
  currentDir = realFor;

  const loc = decodeURIComponent(res.headers.location);
  assert.equal(res.statusCode, 303);
  assert.match(loc, /bad=1/, 'the news the member never got is not a quiet note');
  assert.ok(loc.includes(REFUSAL), 'the box said it, so the box’s sentence is what the page shows');
  assert.match(loc, /Asked again just now/, 'and the fresh ask is stated, so the red box does not read as a standing no');
  assert.equal(asked, 1, 'a refusal describes the last attempt, never a standing verdict, so it still asks');
});

test('a first press is not silent either', async () => {
  currentDir = () => ({
    custodyStatus: async () => ({ ok: true, devices: { pending: [], outcomes: [] }, access: { pending: [], outcomes: [] } }),
    revokeDevice: async () => ({ ok: true, note: 'the mineral applies this itself, usually within a couple of minutes' }),
  });
  const res = mockRes();
  await removeHandler(postReq({ mineral_id: MID, slug: 'laptop' }), res);
  currentDir = realFor;
  const loc = decodeURIComponent(res.headers.location);
  assert.doesNotMatch(loc, /bad=1/);
  assert.match(loc, /couple of minutes/, 'it used to redirect with nothing at all');
});

test('a directory that cannot answer never blocks the removal', async () => {
  let asked = 0;
  currentDir = () => ({
    custodyStatus: async () => { throw new Error('directory down'); },
    revokeDevice: async () => { asked += 1; return { ok: true, note: 'staged' }; },
  });
  const res = mockRes();
  await removeHandler(postReq({ mineral_id: MID, slug: 'laptop' }), res);
  currentDir = realFor;
  assert.equal(asked, 1, 'losing the explanation is bad; losing the ability to cut off a lost laptop is worse');
  assert.equal(res.statusCode, 303);
});

// ---- Recent changes -------------------------------------------------------

test('Recent changes carries the refusal, its reason, and the 24-hour caveat', async () => {
  currentDir = () => ({
    events: async () => ({ ok: true, events: [] }),
    notices: async () => ({ ok: true, notices: [] }),
    minerals: async () => ({ ok: true, minerals: [{
      mineral_id: MID, host: 'qa-member-six.crads-ai.com', label: 'QA Member Six', held_by: 'you',
      access: [], devices: [{ slug: 'second-brain', label: 'second-brain' }], updated: Date.now(),
    }] }),
    custodyStatus: async () => ({
      ok: true,
      devices: { pending: [], outcomes: [{ slug: 'second-brain', outcome: 'refused', reason: REFUSAL, at: Date.now() - 6e5 }] },
      access: { pending: [], outcomes: [] },
    }),
  });
  const res = mockRes();
  await activityHandler({ headers: { cookie: COOKIE }, method: 'GET', url: '/app/activity' }, res);
  currentDir = realFor;

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /QA Member Six refused to remove second-brain/, 'the row the member never got');
  assert.ok(res.body.includes('add another computer first'), 'in the mineral’s own words');
  assert.match(res.body, /most recent attempt/, 'and the store’s two limits are stated');
  assert.doesNotMatch(res.body, /Nothing in the last 30 days/);
});

test('a mineral that could not be asked is named, never rendered as quiet', async () => {
  currentDir = () => ({
    events: async () => ({ ok: true, events: [] }),
    notices: async () => ({ ok: true, notices: [] }),
    minerals: async () => ({ ok: true, minerals: [{ mineral_id: MID, host: 'h.crads-ai.com', label: 'Six', held_by: 'you', access: [] }] }),
    custodyStatus: async () => ({ ok: false, reason: 'the directory answered 500' }),
  });
  const res = mockRes();
  await activityHandler({ headers: { cookie: COOKIE }, method: 'GET', url: '/app/activity' }, res);
  currentDir = realFor;
  assert.match(res.body, /could not be asked what happened/);
  assert.match(res.body, /missing from the list below, not absent from the world/);
});

test('a failed mineral list loses the custody half SILENTLY unless the page says so', async () => {
  // Introduced by this change and caught before it shipped: the custody leg
  // takes its mineral list from the same read, so when that read fails there is
  // no mineral left to count as unaskable and custodyFailed stays 0. Without
  // its own line the loss is invisible, which is the exact failure shape this
  // page was rebuilt to stop.
  currentDir = () => ({
    events: async () => ({ ok: true, events: [] }),
    notices: async () => ({ ok: true, notices: [] }),
    minerals: async () => ({ ok: false, reason: 'the directory answered 500' }),
    custodyStatus: async () => { throw new Error('should never be reached'); },
  });
  const res = mockRes();
  await activityHandler({ headers: { cookie: COOKIE }, method: 'GET', url: '/app/activity' }, res);
  currentDir = realFor;
  assert.match(res.body, /Could not check what your minerals did/);
  assert.match(res.body, /the directory answered 500/);
});

test('a mineral this account merely uses is never asked, so the page earns no 403s', async () => {
  let calls = 0;
  currentDir = () => ({
    events: async () => ({ ok: true, events: [] }),
    notices: async () => ({ ok: true, notices: [] }),
    // no `access` array at all: the worker withholds the roster from plain members
    minerals: async () => ({ ok: true, minerals: [{ mineral_id: MID, host: 'h.crads-ai.com', label: 'Six', held_by: 'someone else' }] }),
    custodyStatus: async () => { calls += 1; return { ok: true, devices: { pending: [], outcomes: [] }, access: { pending: [], outcomes: [] } }; },
  });
  const res = mockRes();
  await activityHandler({ headers: { cookie: COOKIE }, method: 'GET', url: '/app/activity' }, res);
  currentDir = realFor;
  assert.equal(calls, 0);
});
