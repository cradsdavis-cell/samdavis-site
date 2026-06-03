// api/auth/request-link.js — Vercel adapter for POST /api/auth/request-link
//
// Per docs/superpowers/plans/2026-06-03-auth-accounts-implementation.md § Task 1.3.
'use strict';

const { Resend } = require('resend');
const { makeHandler } = require('../../lib/authRequestLink');
const { defaultKv } = require('../../lib/kv');

module.exports = makeHandler({
  kv: defaultKv(),
  resend: new Resend(process.env.RESEND_API_KEY),
});
