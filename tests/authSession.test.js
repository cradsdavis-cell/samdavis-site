'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-do-not-use-in-prod-32-chars-min';
const auth = require('../lib/auth');

test('hashPassword + verifyPassword round-trip', () => {
  const { hash, salt } = auth.hashPassword('correct horse battery');
  assert.ok(hash && salt && hash !== 'correct horse battery');
  assert.strictEqual(auth.verifyPassword('correct horse battery', hash, salt), true);
  assert.strictEqual(auth.verifyPassword('wrong', hash, salt), false);
});

test('verifyPassword is safe on malformed stored values', () => {
  assert.strictEqual(auth.verifyPassword('x', '', ''), false);
  assert.strictEqual(auth.verifyPassword('x', null, null), false);
});

test('session cookie + token are 60 days', () => {
  assert.strictEqual(auth.SESSION_TTL_DAYS, 60);
  const cookie = auth.formatSessionCookie('jwt');
  assert.match(cookie, /Max-Age=5184000/);
  const tok = auth.signSession({ email: 'a@b.com' });
  const decoded = auth.verifySession(tok);
  const lifeDays = (decoded.exp - decoded.iat) / 86400;
  assert.ok(lifeDays > 59 && lifeDays < 61, `got ${lifeDays}d`);
});

test('shouldRefreshSession true only past halfway', () => {
  const now = Math.floor(Date.now() / 1000);
  assert.strictEqual(auth.shouldRefreshSession({ iat: now - 10, exp: now + 5184000 }), false);
  assert.strictEqual(auth.shouldRefreshSession({ iat: now - 5184000 + 10, exp: now + 10 }), true);
});

test('isValidEmail is ReDoS-safe (length cap) and rejects malformed', () => {
  assert.strictEqual(auth.isValidEmail('a@b.com'), true);
  assert.strictEqual(auth.isValidEmail('a@b.c'), true);
  // ReDoS bait: 60k chars — must be rejected instantly by the length cap, not regex-walked.
  const t0 = Date.now();
  assert.strictEqual(auth.isValidEmail('x@' + '.'.repeat(60000) + '@'), false);
  assert.ok(Date.now() - t0 < 50, 'length cap short-circuits before the regex');
  assert.strictEqual(auth.isValidEmail('no-at-sign'), false);
  assert.strictEqual(auth.isValidEmail('a@bcom'), false);
  assert.strictEqual(auth.isValidEmail(''), false);
  assert.strictEqual(auth.isValidEmail(null), false);
});
