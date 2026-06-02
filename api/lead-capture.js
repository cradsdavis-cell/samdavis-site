// api/lead-capture.js — POST captures opt-in email into Lead Nurture sheet
// + sends welcome email immediately via Resend.
//
// Per coaching co-primary spec § 5.2 (LeadCapture form) + § 6.2 #3 (Email 1).
// Subsequent drip emails 2/3/4 handled by Vercel cron (Task 3.2 — separate ship).
'use strict';

const { google } = require('googleapis');
const { Resend } = require('resend');
const { makeHandler } = require('../lib/leadCapture');

const resend = new Resend(process.env.RESEND_API_KEY);
const handler = makeHandler({ google, resend });

module.exports = handler;
