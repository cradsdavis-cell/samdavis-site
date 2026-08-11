// api/auth/request-signin.js — Vercel adapter for POST /api/auth/request-signin
//
// The sender for a real magic-link sign-in. Sibling of request-link.js, which
// sends the password RESET. See lib/authRequestSignin.js for why they are two
// endpoints and not one with a flag.
'use strict';

const { Resend } = require('resend');
const { makeHandler } = require('../../lib/authRequestSignin');
const { defaultKv } = require('../../lib/kv');

module.exports = makeHandler({
  kv: defaultKv(),
  resend: new Resend(process.env.RESEND_API_KEY),
});
