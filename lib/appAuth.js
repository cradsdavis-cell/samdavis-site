'use strict';
// lib/appAuth.js — the Crads APP TOKEN issuer (T3 of the ties+account pass,
// 2026-08-10). The crads-ai.com account is THE Crads account; the desktop app
// holds the 60-day session and exchanges it here for short-lived RS256 tokens
// that the directory worker and managing boxes verify LOCALLY against our
// JWKS — the same trust pattern as a Google id-token, with this site as the
// third issuer. No shared secrets leave this site: a worker or box compromise
// can verify tokens, never mint them.
//
// Env:
//   APP_TOKEN_PRIVATE_KEY   RSA private key, PKCS8 PEM (multiline env var)
//   APP_TOKEN_KID           key id served in the JWKS, default crads-app-1
//
// Claims contract (verified by directory/worker.js verifyIdTokenEdge and
// engine/lib/crads-token-verify.mjs in ai-os):
//   iss https://crads-ai.com · aud crads-directory · sub/email · email_verified
//   sv (state_version at mint — password change bumps it, so revocation lands
//   within the 1h token life) · nonce? (device fingerprint or joinNonce) ·
//   scope? ("enrol" tokens are refused by the worker's affCaller, so a staged
//   enrolment proof can never be replayed to read /edges)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ISSUER = 'https://crads-ai.com';
const AUDIENCE = 'crads-directory';
const TTL_SECONDS = 3600;

// The dashboard is a hostile place for a PEM: pasting there commonly flattens
// the newlines to spaces, stores literal backslash-n sequences, or adds CRs.
// createPrivateKey refuses all three, which surfaced as a 500 on every auth
// route the moment the real key landed (2026-08-10). Normalize every known
// mangling; a still-unparseable key throws the same named error as a missing
// one so the routes answer 503 not_configured instead of crashing.
function normalizePem(raw) {
  // one tolerant pass instead of per-mangling branches: unescape, then find
  // the BEGIN/END markers ANYWHERE (surrounding quotes, prefixes, whatever the
  // paste added), keep only base64 between them, and re-wrap at 64 columns.
  const s = String(raw).replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');
  const m = s.match(/-----BEGIN ([A-Z ]+?)-----([\s\S]*?)-----END \1-----/);
  if (!m) return s.trim();
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, '');
  return `-----BEGIN ${m[1]}-----\n${body.replace(/(.{64})/g, '$1\n').trim()}\n-----END ${m[1]}-----`;
}

function getPrivateKey() {
  const pem = process.env.APP_TOKEN_PRIVATE_KEY;
  if (!pem) throw new Error('APP_TOKEN_PRIVATE_KEY not set');
  const norm = normalizePem(pem);
  try { crypto.createPrivateKey(norm); }
  catch { throw new Error('APP_TOKEN_PRIVATE_KEY not set (present but unparseable: re-paste the PEM)'); }
  return norm;
}

function keyId() { return process.env.APP_TOKEN_KID || 'crads-app-1'; }

function mintAppToken({ email, stateVersion, nonce, scope }) {
  if (!email) throw new Error('mintAppToken needs an email');
  return jwt.sign({
    email,
    email_verified: true,
    sv: stateVersion || 1,
    ...(nonce ? { nonce: String(nonce) } : {}),
    ...(scope ? { scope: String(scope) } : {}),
  }, getPrivateKey(), {
    algorithm: 'RS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: email,
    expiresIn: TTL_SECONDS,
    keyid: keyId(),
  });
}

function appJwks() {
  const pub = crypto.createPublicKey(crypto.createPrivateKey(getPrivateKey()));
  const jwk = pub.export({ format: 'jwk' });
  return { keys: [{ ...jwk, kid: keyId(), alg: 'RS256', use: 'sig' }] };
}

module.exports = { mintAppToken, appJwks, ISSUER, AUDIENCE, TTL_SECONDS };
