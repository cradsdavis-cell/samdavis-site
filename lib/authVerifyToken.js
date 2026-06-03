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

    const user = await kv.getUser(record.email);
    if (!user) {
      await kv.deleteAuthToken(token);
      return res.redirect(302, '/account/verify?error=invalid');
    }

    // Single-use: consume the token before issuing the session.
    await kv.deleteAuthToken(token);

    const jwt = signSession({ email: user.email, state_version: user.state_version || 1 });
    res.setHeader('Set-Cookie', formatSessionCookie(jwt));
    return res.redirect(302, '/account/');
  };
}

module.exports = { makeHandler };
