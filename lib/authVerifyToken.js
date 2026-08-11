// lib/authVerifyToken.js — GET /api/auth/verify-token handler
//
// Single-use magic-link consumer: validates token from KV, signs JWT session
// cookie, redirects to /account/.
// Two consumers:
//   1. api/auth/verify-token.js (Vercel serverless function — thin adapter)
//   2. tests/authVerifyToken.test.js (node:test with mocked KV)
//
// Per docs/superpowers/plans/2026-06-03-auth-accounts-implementation.md § Task 1.4.
'use strict';
const { signSession, formatSessionCookie } = require('./auth');
const { safeNext } = require('./safeNext');

function makeHandler({ kv }) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    const token = req.query && req.query.token;
    if (!token) return res.redirect(302, '/account/verify?error=missing');

    const record = await kv.getAuthToken(token);
    if (!record) return res.redirect(302, '/account/verify?error=invalid');

    if (new Date(record.expires_at) < new Date()) {
      await kv.deleteAuthToken(token);
      return res.redirect(302, '/account/verify?error=expired');
    }

    // TOKEN-PURPOSE SEPARATION. This endpoint mints a session, so the only tokens
    // it may spend are the ones issued to prove a mailbox: 'verify' (email
    // confirmation) and 'signin' (the magic link, added 2026-08-11 with
    // authRequestSignin.js). A 'set-password' token must NEVER be spendable here:
    // it is takeover-grade by design and belongs to the reset flow alone.
    // Allow-list, not a deny-list, so a purpose added later is refused until
    // somebody decides it may sign a person in.
    const SPENDABLE = ['verify', 'signin'];
    if (record.purpose && !SPENDABLE.includes(record.purpose)) {
      await kv.deleteAuthToken(token);
      return res.redirect(302, '/account/verify?error=invalid');
    }

    const user = await kv.getUser(record.email);
    if (!user) {
      await kv.deleteAuthToken(token);
      return res.redirect(302, '/account/verify?error=invalid');
    }

    // Single-use: consume the token before issuing the session.
    await kv.deleteAuthToken(token);

    const { issueSession } = require('./sessions');
    const { cookie } = await issueSession({ kv, email: user.email,
      stateVersion: user.state_version || 1,
      userAgent: req && req.headers && req.headers['user-agent'] });
    res.setHeader('Set-Cookie', cookie);
    // A sign-in link asked for FROM an invitation comes back to the invitation.
    // The destination rides in the link's query rather than the token record,
    // and safeNext refuses anything off-origin, so a crafted link can only send
    // its own recipient somewhere on this site: no worse than the bare link.
    return res.redirect(302, safeNext(req.query && req.query.next) || '/app');
  };
}

module.exports = { makeHandler };
