'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
const { getAuthUrl, makeVerifier, REDIRECT_PATH } = require('../lib/googleAuth');

test('getAuthUrl includes state, scopes, redirect, client id', () => {
  const url = getAuthUrl('state123');
  assert.match(url, /accounts\.google\.com/);
  assert.match(url, /state=state123/);
  assert.match(url, /scope=/);
  assert.match(url, /cid\.apps\.googleusercontent\.com/);
  assert.match(url, /api%2Fauth%2Fgoogle%2Fcallback/);
});

test('verifyCode returns email + sub when email_verified', async () => {
  const fakeClient = {
    async getToken() { return { tokens: { id_token: 'idtok' } }; },
    async verifyIdToken() { return { getPayload: () => ({ email: 'G@x.com', email_verified: true, sub: '12345' }) }; },
  };
  const verify = makeVerifier(() => fakeClient);
  const out = await verify('authcode');
  assert.deepStrictEqual(out, { email: 'g@x.com', sub: '12345', email_verified: true });
});

test('verifyCode throws when email not verified', async () => {
  const fakeClient = {
    async getToken() { return { tokens: { id_token: 'idtok' } }; },
    async verifyIdToken() { return { getPayload: () => ({ email: 'g@x.com', email_verified: false, sub: '1' }) }; },
  };
  const verify = makeVerifier(() => fakeClient);
  await assert.rejects(() => verify('authcode'), /not verified/i);
});

test('verifyCode throws when no id_token', async () => {
  const fakeClient = { async getToken() { return { tokens: {} }; } };
  const verify = makeVerifier(() => fakeClient);
  await assert.rejects(() => verify('authcode'), /id_token/i);
});

test('REDIRECT_PATH is the callback path', () => {
  assert.strictEqual(REDIRECT_PATH, '/api/auth/google/callback');
});
