// lib/email.js — Resend transactional email
'use strict';

const { Resend } = require('resend');

const FROM_CUSTOMER = process.env.FROM_EMAIL || 'Sam Davis <hello@crads-ai.com>';
const FROM_ALERTS = process.env.ALERT_FROM_EMAIL || 'crads-ai alerts <alerts@crads-ai.com>';
const REPLY_TO = process.env.REPLY_TO_EMAIL || 'cradsdavis@gmail.com';

function client() {
  return new Resend(process.env.RESEND_API_KEY);
}

function checkResult(result, context) {
  if (result && result.error) {
    const err = new Error(`Resend ${context} failed: ${result.error.message || JSON.stringify(result.error)}`);
    err.resend = result.error;
    throw err;
  }
  return result;
}

async function sendRaceLossEmail({ to, name, sku, refundAmount }) {
  const resend = client();
  const result = await resend.emails.send({
    from: FROM_CUSTOMER,
    reply_to: REPLY_TO,
    to,
    subject: 'Your booking — slot was taken, refund issued',
    text: `Hi ${name},

The slot you picked for ${sku} got booked by someone else between your selection and payment landing. I've issued a full refund of $${refundAmount} AUD — should appear on your card in 5-10 business days.

You can pick another slot here: https://crads-ai.com/book/${sku}

Sorry about that. If anything still doesn't feel right, just reply to this email and I'll sort it manually.

— Sam`,
  });
  return checkResult(result, 'race-loss email');
}

async function sendSamAlert({ subject, body }) {
  const resend = client();
  const result = await resend.emails.send({
    from: FROM_ALERTS,
    reply_to: REPLY_TO,
    to: process.env.SAM_ALERT_EMAIL,
    subject: `[crads-ai] ${subject}`,
    text: body,
  });
  return checkResult(result, 'Sam alert');
}

module.exports = { sendRaceLossEmail, sendSamAlert, getResendClient: client };
