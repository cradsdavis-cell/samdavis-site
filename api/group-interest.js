// api/group-interest.js — POST captures Group Block interest email when no
// active cohort is scheduled. Writes Group Interest tab in Lead Nurture sheet
// + notifies Sam by email.
//
// Per coaching co-primary spec § 4.7. Pairs with /group's no-cohort fallback.
'use strict';

const { google } = require('googleapis');
const { Resend } = require('resend');
const { makeHandler } = require('../lib/groupInterest');

const resend = new Resend(process.env.RESEND_API_KEY);
const handler = makeHandler({ google, resend });

module.exports = handler;
