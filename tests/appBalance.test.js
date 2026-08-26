// appBalance.test.js — the balance card's data path (2026-08-26).
//
// Under the balance model this is the number that matters. What these pin is
// mostly the failure shapes: a billing page that breaks when one widget cannot
// load is worse than one that shows a little less.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');

// directoryFor mints an RS256 app token per reader, so a signing key must exist
// before the module is required. Same shape as tests/appAuth.test.js.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.APP_TOKEN_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

const { directoryFor } = require('../lib/directory');

const USER = { email: 'Person@Example.com', id: 'acc_1', state_version: 1 };
const dirWith = (impl) => directoryFor(USER, { fetcher: impl, baseUrl: 'https://d' });
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('what has been run up this month comes back in cents', async () => {
  const d = dirWith(async (url) => {
    assert.match(url, /\/my-balance$/);
    return jsonRes({ ok: true, month: '2026-09', accrued_cents: 2305, per_day_cents: 494, last_settled_month: '2026-08', last_settled_cents: 1900, arrears_cents: 0, charging: true, at: 123 });
  });
  const b = await d.balance();
  assert.deepEqual([b.ok, b.month, b.accruedCents, b.perDayCents], [true, '2026-09', 2305, 494]);
  assert.deepEqual([b.lastSettledMonth, b.lastSettledCents, b.arrearsCents, b.charging], ['2026-08', 1900, 0, true]);
});

test('an account never drawn from has NO row, and that is not an error', async () => {
  const d = dirWith(async () => jsonRes({ ok: true, none: true }));
  const b = await d.balance();
  assert.equal(b.ok, true);
  assert.equal(b.none, true);
});

test('an unreachable directory costs the card, never the page', async () => {
  const d = dirWith(async () => { throw new Error('network down'); });
  const b = await d.balance();
  assert.equal(b.ok, false);
  assert.match(b.reason, /could not be reached/);
});

test('a rejected token is reported as a token problem, not as a zero balance', async () => {
  // Showing $0.00 because a token expired would be a lie about someone's money.
  const d = dirWith(async () => jsonRes({}, 401));
  const b = await d.balance();
  assert.equal(b.ok, false);
  assert.match(b.reason, /did not accept/);
});

test('never settled is null, not a month-shaped empty string', async () => {
  // "we have never charged this account" and "we charged it for the month
  // called empty-string" are different facts and the page renders them
  // differently.
  const d = dirWith(async () => jsonRes({ ok: true, month: '2026-09', accrued_cents: 500, last_settled_month: null }));
  const b = await d.balance();
  assert.equal(b.lastSettledMonth, null);
});

test('arrears is surfaced, because a month already delivered is owed', async () => {
  const d = dirWith(async () => jsonRes({ ok: true, month: '2026-10', accrued_cents: 100, arrears_cents: 2305 }));
  assert.equal((await d.balance()).arrearsCents, 2305);
});

test('junk numbers coerce to zero rather than rendering NaN at someone', async () => {
  const d = dirWith(async () => jsonRes({ ok: true, accrued_cents: 'lots', per_day_cents: undefined }));
  const b = await d.balance();
  assert.equal(b.accruedCents, 0);
  assert.equal(b.perDayCents, 0);
});
