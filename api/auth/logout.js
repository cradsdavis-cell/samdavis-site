// api/auth/logout.js — POST /api/auth/logout
//
// Clears the session_jwt cookie via Max-Age=0.
// Per docs/superpowers/plans/2026-06-03-auth-accounts-implementation.md § Task 1.5.
'use strict';
const { formatLogoutCookie } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Set-Cookie', formatLogoutCookie());
  return res.status(200).json({ ok: true });
};
