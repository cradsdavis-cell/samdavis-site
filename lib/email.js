// lib/email.js — Resend transactional email
'use strict';

const { Resend } = require('resend');
const { sessionLabelFor } = require('./skus');

const FROM_CUSTOMER = process.env.FROM_EMAIL || 'Sam Davis <hello@crads-ai.com>';
const FROM_ALERTS = process.env.ALERT_FROM_EMAIL || 'crads-ai alerts <alerts@crads-ai.com>';
const REPLY_TO = process.env.REPLY_TO_EMAIL || 'cradsdavis@gmail.com';

// Canonical sender for transactional AUTH email (welcome / set-password / admin resend).
// Centralised so a single unset env var can't silently disable sign-in email. The auth
// paths previously read a bare process.env.RESEND_FROM_EMAIL with NO fallback, so when it
// was unset in prod every welcome + password-reset send no-opped and clients were locked
// out (account exists, no password, recovery email never arrives). Prefer the dedicated
// RESEND_FROM_EMAIL when set, else the general FROM_EMAIL, else the same verified default
// the booking emails already send from.
const AUTH_FROM = process.env.RESEND_FROM_EMAIL || FROM_CUSTOMER;

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

// Checkout always books session 1, so the label is session 1's. An unknown
// slug (should never happen: the webhook only sees slugs checkout accepted)
// falls back to the raw slug rather than failing the refund email.
function checkoutSessionLabel(sku) {
  try { return sessionLabelFor(sku, 1); } catch { return sku; }
}

async function sendRaceLossEmail({ to, name, sku, refundAmount }) {
  const resend = client();
  const result = await resend.emails.send({
    from: FROM_CUSTOMER,
    replyTo: REPLY_TO,
    to,
    subject: 'Your booking: the slot was taken, refund issued',
    text: `Hi ${name},

The slot you picked for your ${checkoutSessionLabel(sku)} got booked by someone else between your selection and the payment landing. I've issued a full refund of $${refundAmount} AUD; it should appear on your card in 5 to 10 business days.

You can pick another slot here: https://crads-ai.com/book/${sku}

Sorry about that. If anything still doesn't feel right, just reply to this email and I'll sort it manually.

Sam`,
  });
  return checkResult(result, 'race-loss email');
}

// "Thu 1 Oct, 10:00 am AEST": the call time in Sydney time, where Sam's
// calendar lives. The Cal invite carries the buyer's own local time.
function fmtCallTime(slotIso) {
  const d = new Date(slotIso);
  if (Number.isNaN(d.getTime())) return null;
  // Built from parts so ICU version quirks (commas, narrow no-break spaces)
  // cannot change the wording.
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: 'Australia/Sydney', timeZoneName: 'short',
  }).formatToParts(d)) parts[p.type] = p.value;
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toLowerCase()} ${parts.timeZoneName}`;
}

// Roadmap buyers (2026-09-28): this replaces the account welcome email. No
// sign-in link, no portal: the call, one thing to prepare, when the report lands.
function roadmapConfirmationText({ name, slotIso }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const when = fmtCallTime(slotIso);
  const callLine = when
    ? `Your call is on ${when} (the link is in your calendar invite).`
    : 'The time and link for your call are in your calendar invite.';
  return `Hi${first ? ' ' + first : ''},

Thanks for booking your AI problem-solving roadmap. ${callLine}

Before the call, jot down the problem as it shows up in your week, and who it affects.

Your written roadmap follows within 3 business days of the call, with a link to book a second 30-minute call where we go through it together.

If anything needs changing, just reply to this email.

Sam`;
}

async function sendRoadmapConfirmationEmail({ to, name, slotIso }) {
  const resend = client();
  const result = await resend.emails.send({
    from: FROM_CUSTOMER,
    replyTo: REPLY_TO,
    to,
    subject: 'Your AI problem-solving roadmap is booked',
    text: roadmapConfirmationText({ name, slotIso }),
  });
  return checkResult(result, 'roadmap confirmation email');
}

async function sendSamAlert({ subject, body }) {
  const resend = client();
  const result = await resend.emails.send({
    from: FROM_ALERTS,
    replyTo: REPLY_TO,
    to: process.env.SAM_ALERT_EMAIL,
    subject: `[crads-ai] ${subject}`,
    text: body,
  });
  return checkResult(result, 'Sam alert');
}

module.exports = { sendRaceLossEmail, sendRoadmapConfirmationEmail, roadmapConfirmationText, fmtCallTime, sendSamAlert, getResendClient: client, AUTH_FROM };
