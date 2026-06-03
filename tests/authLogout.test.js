'use strict';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const handler = require('../api/auth/logout');

function mockReq(method = 'POST') {
  return { method };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

test('POST clears session cookie + returns 200', async () => {
  const res = mockRes();
  await handler(mockReq('POST'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true });
  const cookie = res.headers['set-cookie'];
  assert.ok(cookie, 'Set-Cookie header should be present');
  assert.ok(cookie.startsWith('session_jwt='), 'cookie should target session_jwt');
  assert.match(cookie, /Max-Age=0/, 'cookie should clear via Max-Age=0');
});

test('GET returns 405', async () => {
  const res = mockRes();
  await handler(mockReq('GET'), res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.body.error, 'method_not_allowed');
});
