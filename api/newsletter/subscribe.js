// api/newsletter/subscribe.js - Vercel adapter for POST /api/newsletter/subscribe
'use strict';
const { Resend } = require('resend');
const { makeSubscribeHandler } = require('../../lib/newsletter');
const { defaultKv } = require('../../lib/kv');

module.exports = makeSubscribeHandler({
  kv: defaultKv(),
  resend: new Resend(process.env.RESEND_API_KEY),
});
