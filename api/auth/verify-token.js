// api/auth/verify-token.js — Vercel adapter for GET /api/auth/verify-token
//
// Per docs/superpowers/plans/2026-06-03-auth-accounts-implementation.md § Task 1.4.
'use strict';

const { makeHandler } = require('../../lib/authVerifyToken');
const { defaultKv } = require('../../lib/kv');

module.exports = makeHandler({ kv: defaultKv() });
