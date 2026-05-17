// lib/email.js — Resend transactional email
'use strict';

const { Resend } = require('resend');

function client() {
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendRaceLossEmail({ to, name, sku, refundAmount }) {
  const resend = client();
  return resend.emails.send({
    from: 'Sam Davis <hello@crads-ai.com>',
    to,
    subject: 'Your booking — slot was taken, refund issued',
    text: `Hi ${name},

The slot you picked for ${sku} got booked by someone else between your selection and payment landing. I've issued a full refund of $${refundAmount} AUD — should appear on your card in 5-10 business days.

You can pick another slot here: https://crads-ai.com/book/${sku}

Sorry about that — first day this booking system is live, working out the kinks.

— Sam`,
  });
}

async function sendSamAlert({ subject, body }) {
  const resend = client();
  return resend.emails.send({
    from: 'crads-ai alerts <alerts@crads-ai.com>',
    to: process.env.SAM_ALERT_EMAIL,
    subject: `[crads-ai] ${subject}`,
    text: body,
  });
}

module.exports = { sendRaceLossEmail, sendSamAlert };
