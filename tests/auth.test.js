'use strict';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
const test = require('node:test');
const assert = require('node:assert');
const auth = require('../lib/auth');

test('generateMagicLinkToken returns 64-char hex string', () => {
  const t = auth.generateMagicLinkToken();
  assert.strictEqual(t.length, 64);
  assert.match(t, /^[0-9a-f]{64}$/);
});

test('generateMagicLinkToken returns unique tokens', () => {
  assert.notStrictEqual(auth.generateMagicLinkToken(), auth.generateMagicLinkToken());
});

test('signSession produces JWT that verifies', () => {
  const jwt = auth.signSession({ email: 'a@b.com', state_version: 1 });
  const payload = auth.verifySession(jwt);
  assert.strictEqual(payload.email, 'a@b.com');
  assert.strictEqual(payload.state_version, 1);
});

test('verifySession returns null for tampered JWT', () => {
  const jwt = auth.signSession({ email: 'a@b.com', state_version: 1 });
  const tampered = jwt.slice(0, -5) + 'xxxxx';
  assert.strictEqual(auth.verifySession(tampered), null);
});

test('verifySession returns null for expired JWT', () => {
  const jwt = auth.signSession({ email: 'a@b.com', state_version: 1 }, { expiresIn: '-1s' });
  assert.strictEqual(auth.verifySession(jwt), null);
});

test('formatSessionCookie produces httpOnly + secure + sameSite=Lax + 7-day Max-Age', () => {
  const cookie = auth.formatSessionCookie('jwt-here');
  assert.match(cookie, /session_jwt=jwt-here/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=604800/);
  assert.match(cookie, /Path=\//);
});

test('formatLogoutCookie produces Max-Age=0', () => {
  const cookie = auth.formatLogoutCookie();
  assert.match(cookie, /session_jwt=;/);
  assert.match(cookie, /Max-Age=0/);
});

test('parseSessionFromRequest reads cookie header', () => {
  const req = { headers: { cookie: 'foo=bar; session_jwt=abc123; baz=qux' } };
  assert.strictEqual(auth.parseSessionFromRequest(req), 'abc123');
});

test('parseSessionFromRequest returns null if cookie missing', () => {
  const req = { headers: { cookie: 'foo=bar' } };
  assert.strictEqual(auth.parseSessionFromRequest(req), null);
});

test('isAdmin returns true for cradsdavis@gmail.com only', () => {
  assert.strictEqual(auth.isAdmin('cradsdavis@gmail.com'), true);
  assert.strictEqual(auth.isAdmin('other@example.com'), false);
});
