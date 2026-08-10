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
  });
  const res = mockRes();
  await handler(mockReq(`session_jwt=${signSession({ email: OPERATOR, state_version: 1 })}`), res);
  currentDir = realFor;

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Accounts \(2\)/, 'every account, with the count');
  assert.match(res.body, /jo@x\.com/, 'including other people\'s');
  assert.match(res.body, /Test Org 4/, 'every mineral');
  assert.match(res.body, /Legacy self-registrations/, 'legacy claims labelled as claims');
  assert.match(res.body, /Not proof of ownership/);
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

test('the admin reader mints an ADMIN-scoped token; the ordinary reader never does', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'directory.js'), 'utf8');
  assert.match(src, /scope: 'admin'/, 'adminAll carries the scope');
  const ordinary = src.slice(0, src.indexOf('revokeDevice'));
  assert.ok(!/scope:/.test(ordinary), 'the per-reader token stays unscoped, so a normal page never holds world-reading credentials');
  assert.match(src, /scope: 'manage'/, 'custody acts mint their own manage-scoped token per call');
});
