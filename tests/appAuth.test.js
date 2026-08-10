'use strict';
// tests/appAuth.test.js — the Crads app-token issuer + handoff (T3, 2026-08-10).
// The contract under test: a signed-in browser mints a one-time code, the app
// redeems it for a 60d session + 1h RS256 app token, refreshes tokens against
// the LIVE state_version, and the JWKS verifies exactly what the key signs.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.APP_TOKEN_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.APP_TOKEN_KID = 'test-kid-1';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { makeKv } = require('../lib/kv');
const { signSession } = require('../lib/auth');
const { mintAppToken, appJwks, ISSUER, AUDIENCE } = require('../lib/appAuth');
const { makeHandoffHandler, makeRedeemHandler, makeTokenHandler } = require('../lib/appHandoff');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { const had = store.has(k); store.delete(k); return had ? 1 : 0; },
    incr: async () => 1, expire: async () => 1,
    keys: async (p) => Array.from(store.keys()).filter(k => k.startsWith(p.replace('*', ''))),
    _store: store,
  };
}
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.redirect = (c, l) => { res.statusCode = c; res.headers.Location = l; return res; };
  return res;
}
const cookieFor = (email, sv) => `session_jwt=${signSession({ email, state_version: sv })}`;
const seedUser = async (kv, email, sv) => kv.setUser(email, { email, state_version: sv, created_at: 'x' });

test('mint -> verify: RS256 against the served JWKS, claims contract intact', () => {
  const tok = mintAppToken({ email: 'sam@x.com', stateVersion: 3, nonce: 'fp:abc123', scope: 'enrol' });
  const jwk = appJwks().keys[0];
  assert.equal(jwk.kid, 'test-kid-1');
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const payload = jwt.verify(tok, pub.export({ type: 'spki', format: 'pem' }), {
    algorithms: ['RS256'], issuer: ISSUER, audience: AUDIENCE,
  });
  assert.equal(payload.sub, 'sam@x.com');
  assert.equal(payload.email, 'sam@x.com');
  assert.equal(payload.email_verified, true);
  assert.equal(payload.sv, 3);
  assert.equal(payload.nonce, 'fp:abc123');
  assert.equal(payload.scope, 'enrol');
  assert.ok(payload.exp - payload.iat === 3600, 'one-hour life');
  // alg confusion: the same token must NOT verify as HS256 with the public key
  assert.throws(() => jwt.verify(tok, pub.export({ type: 'spki', format: 'pem' }), { algorithms: ['HS256'] }));
});

test('handoff: consented browser session mints a single-use 120s code; gates hold', async () => {
  const kv = makeKv(fakeKvClient());
  await seedUser(kv, 'sam@x.com', 1);
  const handoff = makeHandoffHandler({ kv });
  // no session -> 401
  let res = mockRes();
  await handoff({ method: 'POST', headers: {}, body: { port: 4321, state: 'abc' } }, res);
  assert.equal(res.statusCode, 401);
  // stale state_version -> 401 (password change kills the handoff too)
  res = mockRes();
  await handoff({ method: 'POST', headers: { cookie: cookieFor('sam@x.com', 99) }, body: { port: 4321, state: 'abc' } }, res);
  assert.equal(res.statusCode, 401);
  // bad port / bad state -> 400
  for (const body of [{ port: 80, state: 'abc' }, { port: 4321, state: '' }, { port: 4321, state: 'no spaces' }]) {
    res = mockRes();
    await handoff({ method: 'POST', headers: { cookie: cookieFor('sam@x.com', 1) }, body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  // the good path
  res = mockRes();
  await handoff({ method: 'POST', headers: { cookie: cookieFor('sam@x.com', 1) }, body: { port: 4321, state: 'abc-DEF_1' } }, res);
  assert.equal(res.statusCode, 200);
  const m = res.body.redirect.match(/^http:\/\/127\.0\.0\.1:4321\/cb\?code=([0-9a-f]{64})&state=abc-DEF_1$/);
  assert.ok(m, 'redirect goes to the app loopback with the code + state: ' + res.body.redirect);
  const rec = await kv.getAuthToken(m[1]);
  assert.equal(rec.purpose, 'app-handoff');
  assert.ok(new Date(rec.expires_at) - Date.now() <= 120 * 1000, 'fail-closed expiry stamped');
});

test('redeem: single-use, purpose-checked, fail-closed expiry; yields session + app token', async () => {
  const kv = makeKv(fakeKvClient());
  await seedUser(kv, 'sam@x.com', 2);
  const handoff = makeHandoffHandler({ kv });
  const redeem = makeRedeemHandler({ kv });
  let res = mockRes();
  await handoff({ method: 'POST', headers: { cookie: cookieFor('sam@x.com', 2) }, body: { port: 4321, state: 'abc' } }, res);
  const code = res.body.redirect.match(/code=([0-9a-f]{64})/)[1];
  // a set-password token can never be spent here (purpose separation)
  await kv.setAuthToken('f'.repeat(64), { email: 'sam@x.com', purpose: 'set-password', expires_at: new Date(Date.now() + 60000).toISOString() }, 60);
  res = mockRes();
  await redeem({ method: 'POST', headers: {}, body: { code: 'f'.repeat(64) } }, res);
  assert.equal(res.statusCode, 401, 'wrong-purpose token refused');
  // the real code works once
  res = mockRes();
  await redeem({ method: 'POST', headers: {}, body: { code } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, 'sam@x.com');
  const sess = require('../lib/auth').verifySession(res.body.session_jwt);
  assert.equal(sess.state_version, 2, 'the session carries the live state_version');
  const jwk = appJwks().keys[0];
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  assert.equal(jwt.verify(res.body.app_token, pub, { algorithms: ['RS256'] }).email, 'sam@x.com');
  // ...and only once
  res = mockRes();
  await redeem({ method: 'POST', headers: {}, body: { code } }, res);
  assert.equal(res.statusCode, 401, 'single-use');
  // an expired-but-undeleted code is refused by the in-app check
  await kv.setAuthToken('e'.repeat(64), { email: 'sam@x.com', purpose: 'app-handoff', expires_at: new Date(Date.now() - 1000).toISOString() }, 600);
  res = mockRes();
  await redeem({ method: 'POST', headers: {}, body: { code: 'e'.repeat(64) } }, res);
  assert.equal(res.statusCode, 401, 'fail-closed expiry, never the store TTL alone');
});

test('token refresh: live state_version enforced, nonce + scope ride, junk scope refused', async () => {
  const kv = makeKv(fakeKvClient());
  await seedUser(kv, 'sam@x.com', 1);
  const tokenH = makeTokenHandler({ kv });
  const auth = { authorization: 'Bearer ' + signSession({ email: 'sam@x.com', state_version: 1 }) };
  let res = mockRes();
  await tokenH({ method: 'POST', headers: auth, body: { nonce: 'joinNonce:acme' } }, res);
  assert.equal(res.statusCode, 200);
  const jwk = appJwks().keys[0];
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  assert.equal(jwt.verify(res.body.app_token, pub, { algorithms: ['RS256'] }).nonce, 'joinNonce:acme');
  // password change bumps state_version -> every machine's session dies at the next mint
  await kv.setUser('sam@x.com', { email: 'sam@x.com', state_version: 2 });
  res = mockRes();
  await tokenH({ method: 'POST', headers: auth, body: {} }, res);
  assert.equal(res.statusCode, 401, 'stale state_version refused');
  // junk scope is a shaped refusal
  await kv.setUser('sam@x.com', { email: 'sam@x.com', state_version: 1 });
  res = mockRes();
  await tokenH({ method: 'POST', headers: auth, body: { scope: 'admin' } }, res);
  assert.equal(res.statusCode, 400);
});

test('a dashboard-mangled PEM still parses: literal \\n, CRLF, flattened-to-spaces, single line', () => {
  const goodPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim();
  const orig = process.env.APP_TOKEN_PRIVATE_KEY;
  const manglings = {
    'literal backslash-n': goodPem.replace(/\n/g, '\\n'),
    'CRLF': goodPem.replace(/\n/g, '\r\n'),
    'newlines flattened to spaces': goodPem.replace(/\n/g, ' '),
    'whole PEM base64-encoded to one line': Buffer.from(goodPem).toString('base64'),
    'single line, no separators': goodPem.replace(/-----\n/g, '-----').replace(/\n-----/g, '-----')
      .replace(/^(-----BEGIN PRIVATE KEY-----)/, '$1').replace(/\n/g, ''),
  };
  try {
    for (const [name, mangled] of Object.entries(manglings)) {
      process.env.APP_TOKEN_PRIVATE_KEY = mangled;
      const jwks = appJwks();
      assert.ok(jwks.keys[0].n, `JWKS derives through the mangling: ${name}`);
      const tok = mintAppToken({ email: 'sam@x.com', stateVersion: 1 });
      const pub = crypto.createPublicKey({ key: jwks.keys[0], format: 'jwk' }).export({ type: 'spki', format: 'pem' });
      assert.equal(jwt.verify(tok, pub, { algorithms: ['RS256'] }).email, 'sam@x.com', `mint+verify through: ${name}`);
    }
    // genuinely broken key: the same named error as a missing one, never a crash type
    process.env.APP_TOKEN_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ngarbage\n-----END PRIVATE KEY-----';
    assert.throws(() => appJwks(), /APP_TOKEN_PRIVATE_KEY not set/);
  } finally {
    process.env.APP_TOKEN_PRIVATE_KEY = orig;
  }
});
