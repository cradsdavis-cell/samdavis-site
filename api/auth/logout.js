// api/auth/logout.js — POST /api/auth/logout
//
// Clears the session_jwt cookie via Max-Age=0.
// Per docs/superpowers/plans/2026-06-03-auth-accounts-implementation.md § Task 1.5.
'use strict';
const { formatLogoutCookie } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Set-Cookie', formatLogoutCookie());
  // The sidebar logout is a native <form> POST, so respond with a redirect (303 → GET)
  // back to the login page rather than stranding the user on a raw {"ok":true} JSON body.
  // Explicit JSON clients can opt in via Accept: application/json.
  const accept = String((req.headers && req.headers.accept) || '');
  if (accept.includes('application/json')) return res.status(200).json({ ok: true });
  return res.redirect(303, '/account/login');
};
