// lib/email.js — Resend transactional email
'use strict';

const { Resend } = require('resend');
const { sessionLabelFor } = require('./skus');
const { cleanTimeZone, SAM_TIME_ZONE } = require('./timeZone');

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

// "Thu 1 Oct, 10:00 am AEST": the call time in the buyer's own zone (from
// their browser at booking), Sydney when it is missing or unknown.
function fmtCallTime(slotIso, timeZone) {
  const d = new Date(slotIso);
  if (Number.isNaN(d.getTime())) return null;
  const zone = cleanTimeZone(timeZone);
  // Built from parts so ICU version quirks (commas, narrow no-break spaces)
  // cannot change the wording.
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: zone, timeZoneName: 'short',
  }).formatToParts(d)) parts[p.type] = p.value;
  const base = `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toLowerCase()}`;
  if (zone === SAM_TIME_ZONE || !zone.includes('/')) return `${base} ${parts.timeZoneName}`;
  // Outside Sydney ICU often only knows "GMT-4", so name the place too:
  // "Mon 19 Oct, 10:00 pm New York time (GMT-4)".
  const place = zone.split('/').pop().replace(/_/g, ' ');
  return `${base} ${place} time (${parts.timeZoneName})`;
}

// Sam's "greatest hits" (Content card, 21 Oct 2026): one short block of reading
// for before the call. The booking form has no door question, so every
// roadmap buyer gets the same two: the guide and the 90-second film (the
// AI-foundation film from the old homepage, 22 Sep 2026).
const GREATEST_HITS = {
  guide: 'https://crads-ai.com/guides/claude-remember-your-business',
  film: 'https://crads-ai.com/lib/video/crads-ai-foundation.mp4',
};

// Roadmap buyers (2026-09-28): this replaces the account welcome email. No
// sign-in link, no portal: the call, one thing to prepare, when the report lands.
// 2026-10-22: the prep line covers the whole business (the call goes through
// all the pain points), not one problem; "AI roadmap" as on the site.
function roadmapConfirmationText({ name, slotIso, timeZone }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const when = fmtCallTime(slotIso, timeZone);
  const callLine = when
    ? `Your call is on ${when} (the link is in your calendar invite).`
    : 'The time and link for your call are in your calendar invite.';
  return `Hi${first ? ' ' + first : ''},

Thanks for booking your AI roadmap. ${callLine}

Before the call, jot down what's slow, what's stuck and what you're carrying in your head. We'll go through all of it.

If it's useful before we talk:
- Why Claude forgets your business, and the fix (a 4-minute read): ${GREATEST_HITS.guide}
- The whole idea in 90 seconds (a short film): ${GREATEST_HITS.film}

Your written roadmap follows within 3 business days of the call, with a link to book a second 30-minute call where we go through it together.

If anything needs changing, just reply to this email.

Sam`;
}

async function sendRoadmapConfirmationEmail({ to, name, slotIso, timeZone }) {
  const resend = client();
  const result = await resend.emails.send({
    from: FROM_CUSTOMER,
    replyTo: REPLY_TO,
    to,
    subject: 'Your AI roadmap is booked',
    text: roadmapConfirmationText({ name, slotIso, timeZone }),
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
