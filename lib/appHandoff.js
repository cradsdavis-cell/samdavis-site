'use strict';
// lib/appHandoff.js — the desktop app's way into the account (T3, 2026-08-10).
// Three handlers, one story:
//   handoff — a signed-in BROWSER (cookie session) consents and mints a
//             one-time 120s code, handed to the app's localhost listener.
//             The 60-day credential itself never rides a URL.
//   redeem  — the APP swaps the code for its own 60-day session JWT + a 1h
//             app token. Single-use, purpose-checked, fail-closed expiry
//             (never trusts the store's TTL alone — the authVerifyToken rule).
//   token   — the APP swaps its session for a fresh app token whenever one is
//             needed; nonce (device fingerprint / joinNonce) and scope ride at
//             mint. state_version is checked against the live user record on
//             EVERY mint, so a password change cuts every machine within the
//             1-hour token life.
const crypto = require('crypto');
const { parseSessionFromRequest, verifySession, signSession } = require('./auth');
const { mintAppToken, TTL_SECONDS } = require('./appAuth');

const CODE_TTL_SECONDS = 120;
// the one scope the app may ask for; anything else is a shaped refusal
const SCOPES = ['enrol'];

async function sessionUser({ kv, req }) {
  const jwt = parseSessionFromRequest(req);
  if (!jwt) return null;
  const payload = verifySession(jwt);
  if (!payload) return null;
  const user = await kv.getUser(payload.email);
  if (!user) return null;
  if ((user.state_version || 1) !== (payload.state_version || 1)) return null;
  return user;
}

function makeHandoffHandler({ kv }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const user = await sessionUser({ kv, req });
    if (!user) return res.status(401).json({ error: 'sign_in_first' });
    const port = parseInt((req.body || {}).port, 10);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return res.status(400).json({ error: 'bad_port' });
    const state = String((req.body || {}).state || '');
    if (!state || state.length > 128 || /[^A-Za-z0-9_-]/.test(state)) return res.status(400).json({ error: 'bad_state' });
    const code = crypto.randomBytes(32).toString('hex');
    await kv.setAuthToken(code, {
      email: user.email,
      purpose: 'app-handoff',
      state_version: user.state_version || 1,
      expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
    }, CODE_TTL_SECONDS);
    // the consent page navigates here; only the throwaway code + the app's own
    // state cross the localhost boundary
    return res.status(200).json({ ok: true, redirect: `http://127.0.0.1:${port}/cb?code=${code}&state=${encodeURIComponent(state)}` });
  };
}

function makeRedeemHandler({ kv }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const code = String((req.body || {}).code || '');
    if (!/^[0-9a-f]{64}$/.test(code)) return res.status(400).json({ error: 'bad_code' });
    const rec = await kv.getAuthToken(code);
    if (!rec || rec.purpose !== 'app-handoff') return res.status(401).json({ error: 'invalid_code' });
    // fail-closed in-app expiry: the store's TTL is a convenience, not the check
    if (!rec.expires_at || new Date(rec.expires_at) < new Date()) {
      await kv.deleteAuthToken(code);
      return res.status(401).json({ error: 'expired_code' });
    }
    await kv.deleteAuthToken(code);   // single-use, consumed before anything is issued
    const user = await kv.getUser(rec.email);
    if (!user) return res.status(401).json({ error: 'invalid_code' });
    const sv = user.state_version || 1;
    const { issueSession } = require('./sessions');
    const issued = await issueSession({ kv, email: user.email, stateVersion: sv,
      label: 'Crads-AI app', userAgent: 'crads-app' });
    return res.status(200).json({
      ok: true,
      email: user.email,
      session_jwt: issued.jwt,
      app_token: mintAppToken({ email: user.email, stateVersion: sv, accountId: user.id, billingEnabled: !!user.billing_enabled }),
      app_token_exp: Date.now() + TTL_SECONDS * 1000,
    });
  };
}

function makeTokenHandler({ kv }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    // the app is not a browser: its session rides the Authorization header
    const m = String(req.headers && req.headers.authorization || '').match(/^Bearer (.+)$/);
    const payload = m && verifySession(m[1]);
    if (!payload) return res.status(401).json({ error: 'sign_in_needed' });
    const user = await kv.getUser(payload.email);
    if (!user || (user.state_version || 1) !== (payload.state_version || 1)) {
      // a password change bumped state_version: every other machine signs in again
      return res.status(401).json({ error: 'sign_in_needed' });
    }
    const body = req.body || {};
    const nonce = body.nonce === undefined ? '' : String(body.nonce);
    if (nonce && (nonce.length > 128 || /[^A-Za-z0-9:_-]/.test(nonce))) return res.status(400).json({ error: 'bad_nonce' });
    const scope = body.scope === undefined ? '' : String(body.scope);
    if (scope && !SCOPES.includes(scope)) return res.status(400).json({ error: 'bad_scope' });
    return res.status(200).json({
      ok: true,
      email: user.email,
      app_token: mintAppToken({ email: user.email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled,
        ...(nonce ? { nonce } : {}), ...(scope ? { scope } : {}) }),
      app_token_exp: Date.now() + TTL_SECONDS * 1000,
    });
  };
}

module.exports = { makeHandoffHandler, makeRedeemHandler, makeTokenHandler, CODE_TTL_SECONDS };
