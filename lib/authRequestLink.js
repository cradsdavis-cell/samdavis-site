// lib/authRequestLink.js — POST /api/auth/request-link handler
//
// Email-enum-resistant magic-link sender with per-email throttle.
// Two consumers:
//   1. api/auth/request-link.js (Vercel serverless function — thin adapter)
//   2. tests/authRequestLink.test.js (node:test with mocked KV + Resend)
//
// Per docs/superpowers/plans/2026-06-03-auth-accounts-implementation.md § Task 1.3.
'use strict';
const { generateMagicLinkToken } = require('./auth');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const THROTTLE_LIMIT = 5;
const TOKEN_TTL_SECONDS = 900; // 15 min

function makeHandler({ kv, resend }) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || 'https://crads-ai.com');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    const count = await kv.incrementThrottle(email);
    if (count > THROTTLE_LIMIT) {
      return res.status(429).json({ error: 'too_many_requests', retry_after_seconds: 900 });
    }

    const user = await kv.getUser(email);
    if (!user) {
      // Email-enum-resistant: same 200 response regardless of whether user exists.
      return res.status(200).json({ ok: true, message: 'If that email exists, a sign-in link was sent.' });
    }

    const token = generateMagicLinkToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
    await kv.setAuthToken(
      token,
      { email, expires_at: expiresAt, created_at: new Date().toISOString() },
      TOKEN_TTL_SECONDS
    );

    const baseUrl = process.env.BASE_URL || 'https://crads-ai.com';
    const link = `${baseUrl}/account/verify?token=${token}`;
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Sign in to your crads-ai account',
      html: `<p>Hi,</p>
<p>Click here to sign in: <a href="${link}">${link}</a></p>
<p>This link expires in 15 minutes and can only be used once. If you didn't request it, you can ignore this email.</p>
<p>— Sam</p>`,
    });

    return res.status(200).json({ ok: true, message: 'Sign-in link sent. Check your email.' });
  };
}

module.exports = { makeHandler, EMAIL_RE, THROTTLE_LIMIT, TOKEN_TTL_SECONDS };
