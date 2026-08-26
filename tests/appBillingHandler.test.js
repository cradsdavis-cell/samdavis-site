// appBillingHandler.test.js — the billing page HANDLER actually runs.
//
// Why this file exists. On 2026-08-26 /app/billing was deployed with `const
// user = await requireAuth(...)` reassigned four lines later, which throws
// "Assignment to constant variable" on EVERY request. It reached production and
// crashed the page with a 500.
//
// Nothing caught it: `node --check` sees only syntax and this is a runtime
// error, and all 348 existing tests either exercise the PURE billingView or
// assert on the handler's SOURCE TEXT. A file whose source is read but never
// executed is a file nobody has tested.
'use strict';
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-here';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.APP_TOKEN_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
const { signSession } = require('../lib/auth');

const USER = { email: 'person@example.com', id: 'acc_1', state_version: 1 };
let card = { ...USER, has_card: false };
// The record carries has_card, which is what the page reads. The Stripe refresh
// is guarded on STRIPE_SECRET_KEY and is absent here on purpose: that models a
// deployment with no Stripe key, where the page must fall back to the last known
// value rather than crash or claim billing is on.
const fakeKv = {
  async getUser() { return { ...card }; },
  async setUser() { return true; },
  async get() { return null; },
  async set() { return true; },
};
// Delegators BEFORE the require, or the handler holds the real ones.
const kvMod = require('../lib/kv');
const dirMod = require('../lib/directory');
const cardMod = require('../lib/cardOnFile');
const portalMod = require('../lib/cradsPortal');
kvMod.defaultKv = () => fakeKv;
cardMod.refreshCardOnFile = async () => card;
portalMod.cradsPortalUrl = async () => ({ url: null, why: 'no platform customer yet' });
let balance = { ok: true, none: true };
dirMod.directoryFor = () => ({
  email: USER.email, emailHash: 'x',
  async minerals() { return { ok: true, minerals: [] }; },
  async events() { return { ok: true, events: [] }; },
  async balance() { return balance; },
  async setLicence() { return { ok: true }; },
});
const handler = require('../api/app/billing.js');

const mockReq = (cookie) => ({ method: 'GET', url: '/app/billing', headers: cookie ? { cookie } : {} });
const mockRes = () => ({
  statusCode: 200, headers: {}, body: '',
  status(c) { this.statusCode = c; return this; },
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
  send(b) { this.body = String(b == null ? '' : b); return this; },
  end(b) { if (b) this.body = String(b); return this; },
  redirect(a, b) { this.statusCode = typeof a === 'number' ? a : 302; this.headers.location = typeof a === 'number' ? b : a; return this; },
});
const signedIn = () => mockReq(`session_jwt=${signSession({ email: USER.email, state_version: 1 })}`);

test('the handler RUNS for a signed-in account and renders a page', async () => {
  const res = mockRes();
  await handler(signedIn(), res);
  assert.equal(res.statusCode, 200, 'this is the assertion that would have caught the const reassignment');
  assert.match(res.body, /Billing/);
});

test('with no card it says billing is off, and says how to fix it', async () => {
  card = { ...USER, has_card: false };
  const res = mockRes();
  await handler(signedIn(), res);
  assert.match(res.body, /Billing off/);
  assert.match(res.body, /No card on file/);
  assert.match(res.body, /Leaving, downgrading and removing always work/, 'and never gates a reducing act');
});

test('with a card it says billing is on and names the card', async () => {
  card = { ...USER, has_card: true, card_brand: 'visa', card_last4: '4242' };
  const res = mockRes();
  await handler(signedIn(), res);
  assert.match(res.body, /Billing on/);
  assert.match(res.body, /visa ending 4242/);
});

test('an account with an accrual sees what it has run up and when it is charged', async () => {
  card = { ...USER, has_card: true, card_brand: 'visa', card_last4: '4242' };
  balance = { ok: true, month: '2026-09', accruedCents: 2305, perDayCents: 494, lastSettledMonth: '2026-08', lastSettledCents: 1900, arrearsCents: 0, charging: true };
  const res = mockRes();
  await handler(signedIn(), res);
  assert.match(res.body, /\$23\.05/);
  assert.match(res.body, /run up so far this month/);
  assert.match(res.body, /1 October/, 'charged on the 1st of the month AFTER the accrual month');
  assert.match(res.body, /Last charged \$19\.00 for 2026-08/);
});

test('arrears get their own block, because a month already delivered is a different sentence', async () => {
  balance = { ok: true, month: '2026-10', accruedCents: 100, perDayCents: 10, lastSettledMonth: null, lastSettledCents: 0, arrearsCents: 2305, charging: true };
  const res = mockRes();
  await handler(signedIn(), res);
  assert.match(res.body, /Payment overdue/);
  assert.match(res.body, /\$23\.05 is still owed/);
  assert.match(res.body, /access is only ever paused, never removed/);
});

test('an unreadable balance costs the card, never the page', async () => {
  balance = { ok: false, reason: 'the directory could not be reached' };
  const res = mockRes();
  await handler(signedIn(), res);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /run up so far this month/);
});

test('signed out is the auth wall, not a crash and not a page', async () => {
  const res = mockRes();
  await handler(mockReq(''), res);
  assert.ok(res.statusCode === 302 || res.statusCode === 401, `got ${res.statusCode}`);
});
