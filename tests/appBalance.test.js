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

test('a published balance comes back in cents, with runway', async () => {
  const d = dirWith(async (url) => {
    assert.match(url, /\/my-balance$/);
    return jsonRes({ ok: true, balance_cents: 22794, burn_cents: 786, runway_days: 29, at: 123 });
  });
  const b = await d.balance();
  assert.deepEqual([b.ok, b.balanceCents, b.burnCents, b.runwayDays], [true, 22794, 786, 29]);
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

test('an unknowable runway stays null, because null and zero mean opposite things', async () => {
  const d = dirWith(async () => jsonRes({ ok: true, balance_cents: 5000, burn_cents: 0, runway_days: null }));
  const b = await d.balance();
  assert.equal(b.runwayDays, null);
  assert.notEqual(b.runwayDays, 0);
});

test('junk numbers coerce to zero rather than rendering NaN at someone', async () => {
  const d = dirWith(async () => jsonRes({ ok: true, balance_cents: 'lots', burn_cents: undefined }));
  const b = await d.balance();
  assert.equal(b.balanceCents, 0);
  assert.equal(b.burnCents, 0);
});
