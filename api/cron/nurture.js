// api/cron/nurture.js — Vercel Cron daily nurture-email sweep
// Invoked by Vercel Cron per vercel.json (`0 23 * * *` UTC ≈ 09:00 AEST).
// Authenticates via Authorization: Bearer ${CRON_SECRET}.
// Per coaching co-primary spec § 5.3 + Task 3.2.
'use strict';

const { google } = require('googleapis');
const { Resend } = require('resend');
const { makeHandler } = require('../../lib/nurtureCron');

const resend = new Resend(process.env.RESEND_API_KEY);
const handler = makeHandler({ google, resend });

module.exports = handler;
