// api/invite/send.js — Vercel adapter for POST /api/invite/send
//
// Called by the crads directory worker, never by a browser and never by a box
// directly. See lib/inviteSend.js for why the chain is box -> directory -> here
// and why this endpoint fails closed without INVITE_SEND_TOKEN.
'use strict';

const { Resend } = require('resend');
const { makeHandler } = require('../../lib/inviteSend');

module.exports = makeHandler({
  resend: new Resend(process.env.RESEND_API_KEY),
});
