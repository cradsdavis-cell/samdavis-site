// lib/newsletter.js - the essay mailing list (2026-10-11)
//
// POST /api/newsletter/subscribe  { email, source, website }
//   Validates, throttles, and emails a confirm link (double opt-in, so nobody
//   can be signed up by someone else). Same 200 whether the address is new,
//   pending or already subscribed. `website` is a honeypot: bots fill it,
//   people never see it, and a filled one gets a quiet 200 and no email.
// GET /api/newsletter/confirm?token=...
//   Turns a pending token into a subscriber row, then redirects to /writing
//   where site.js shows the result.
// GET|POST /api/newsletter/unsubscribe?e=<email>&t=<sig>
//   One click, no login. The signature is an HMAC of the address under
//   SESSION_SECRET, so a link only ever unsubscribes the person it was sent
//   to. POST answers RFC 8058 one-click (List-Unsubscribe-Post) from mail apps.
//
// Every row records `consent`, the basis for sending to it:
//   double-opt-in      signed up on the site and clicked the confirm link
//   express-booking    ticked the box when booking a discovery call
//   inferred-customer  imported: paid client or had a roadmap (Sam, 11 Oct)
//
// Two consumers each: the thin Vercel adapters in api/newsletter/ and
// tests/newsletter.test.js (mocked KV + Resend).
'use strict';
const crypto = require('crypto');
const { generateMagicLinkToken, isValidEmail } = require('./auth');

const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM_EMAIL || 'Sam Davis <sam@crads-ai.com>';
const EMAIL_LIMIT = 3;   // confirm emails per address per 15 min
const IP_LIMIT = 10;     // signups per IP per 15 min

function baseUrl() { return process.env.BASE_URL || 'https://crads-ai.com'; }

function cleanSource(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return /^\/[a-z0-9\-/]{0,120}$/i.test(s) ? s : '/writing';
}

function clientIp(req) {
  const xff = (req.headers && req.headers['x-forwarded-for']) || '';
  return String(xff).split(',')[0].trim() || 'unknown';
}

function unsubSig(email) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  return crypto.createHmac('sha256', secret).update('unsub:' + email).digest('hex').slice(0, 32);
}

function unsubscribeUrl(email) {
  return `${baseUrl()}/api/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubSig(email)}`;
}

function sigMatches(email, sig) {
  if (typeof sig !== 'string' || !/^[a-f0-9]{32}$/.test(sig)) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(unsubSig(email)));
}

// Adds (or re-adds) a subscriber directly, for paths that already carry
// consent: the booking tick box and the customer import. No confirm email.
async function addSubscriber(kv, email, { source, consent }) {
  const prior = await kv.getSubscriber(email);
  if (prior && prior.status === 'subscribed') return { added: false, reason: 'already_subscribed' };
  // An inferred-consent import must never undo someone's unsubscribe.
  if (prior && prior.status === 'unsubscribed' && consent === 'inferred-customer') {
    return { added: false, reason: 'previously_unsubscribed' };
  }
  const now = new Date().toISOString();
  await kv.setSubscriber(email, { email, status: 'subscribed', source, consent, subscribed_at: now, confirmed_at: now });
  return { added: true };
}

function confirmEmail(link) {
  return {
    subject: 'Confirm: essays from Sam Davis',
    text: `Hi,

Someone (hopefully you) asked to get my essays by email. Click to confirm:

${link}

If that wasn't you, ignore this and you won't hear from me.

Sam
crads-ai.com/writing`,
  };
}

function makeSubscribeHandler({ kv, resend }) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', baseUrl());
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const body = req.body || {};
    const ok = () => res.status(200).json({ ok: true });

    if (typeof body.website === 'string' && body.website.trim()) return ok();

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });

    if ((await kv.incrementThrottle('subip:' + clientIp(req))) > IP_LIMIT ||
        (await kv.incrementThrottle('sub:' + email)) > EMAIL_LIMIT) {
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const existing = await kv.getSubscriber(email);
    if (existing && existing.status === 'subscribed') return ok();

    const token = generateMagicLinkToken();
    await kv.setSubToken(token, { email, source: cleanSource(body.source), created_at: new Date().toISOString() });

    const link = `${baseUrl()}/api/newsletter/confirm?token=${token}`;
    const result = await resend.emails.send({ from: NEWSLETTER_FROM, to: email, ...confirmEmail(link) });
    if (result && result.error) return res.status(502).json({ error: 'send_failed' });

    return ok();
  };
}

function makeConfirmHandler({ kv }) {
  return async function handler(req, res) {
    const go = (state) => {
      res.status(302);
      res.setHeader('Location', `/writing?subscribed=${state}#subscribe`);
      return res.end();
    };
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    const token = req.query && typeof req.query.token === 'string' ? req.query.token : '';
    if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return go('expired');

    const pending = await kv.getSubToken(token);
    if (!pending || !pending.email) return go('expired');

    const prior = await kv.getSubscriber(pending.email);
    const now = new Date().toISOString();
    await kv.setSubscriber(pending.email, {
      email: pending.email,
      status: 'subscribed',
      source: pending.source || '/writing',
      consent: 'double-opt-in',
      subscribed_at: (prior && prior.status === 'subscribed' && prior.subscribed_at) || now,
      confirmed_at: now,
    });
    await kv.deleteSubToken(token);
    return go('1');
  };
}

function makeUnsubscribeHandler({ kv }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const q = req.query || {};
    const email = typeof q.e === 'string' ? q.e.trim().toLowerCase() : '';
    const valid = email && isValidEmail(email) && sigMatches(email, q.t);

    if (valid) {
      const prior = await kv.getSubscriber(email);
      if (prior && prior.status !== 'unsubscribed') {
        await kv.setSubscriber(email, { ...prior, status: 'unsubscribed', unsubscribed_at: new Date().toISOString() });
      }
    }
    if (req.method === 'POST') return valid ? res.status(200).json({ ok: true }) : res.status(400).json({ error: 'invalid_link' });
    res.status(302);
    res.setHeader('Location', `/writing?subscribed=${valid ? 'unsubscribed' : 'badlink'}#subscribe`);
    return res.end();
  };
}

module.exports = { makeSubscribeHandler, makeConfirmHandler, makeUnsubscribeHandler, addSubscriber, unsubscribeUrl, unsubSig, confirmEmail, cleanSource, NEWSLETTER_FROM, EMAIL_LIMIT, IP_LIMIT };
