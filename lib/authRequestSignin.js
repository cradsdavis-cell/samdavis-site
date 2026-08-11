// lib/authRequestSignin.js — POST /api/auth/request-signin handler
//
// The sign-in link the login page has always OFFERED and never sent.
//
// The button on account/login.html said "Email me a sign-in link instead" and
// posted to /api/auth/request-link, which mints a `set-password` token and mails
// "Set your crads-ai password". That is a password reset, correctly built, doing
// what a reset should. It is the wrong thing to hand somebody who only wanted to
// log in: setting a password bumps state_version (passwordAuth.js), and every
// session carries the sv it was minted at, so following the "sign-in link"
// signed the account out of every other machine, the desktop app included.
//
// The consumer for a real magic link already existed: authVerifyToken.js
// validates a token, issues a session, and touches neither the password nor
// state_version. Only the sender was missing. This is it.
//
// Deliberately a sibling of authRequestLink.js rather than a flag on it: the two
// mint different-purpose tokens, and token-purpose separation is the thing that
// stops a reset link being spent as a sign-in (authVerifyToken.js § purpose).
// One function with a mode argument is one typo away from erasing that.
//
// Two consumers:
//   1. api/auth/request-signin.js (Vercel serverless function — thin adapter)
//   2. tests/authRequestSignin.test.js (node:test with mocked KV + Resend)
'use strict';
const { generateMagicLinkToken, isValidEmail } = require('./auth');
const { AUTH_FROM } = require('./email');

const THROTTLE_LIMIT = 5;
// Shorter than the reset link's hour. A sign-in link is used within a minute of
// asking for it, and it is bearer access to the account for as long as it lives.
const TOKEN_TTL_SECONDS = 15 * 60;

function makeHandler({ kv, resend }) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || 'https://crads-ai.com');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const rawEmail = req.body && req.body.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    // Its own throttle bucket, like the reset flow has its own: flooding one
    // must not deny the other, and neither must deny password login.
    const count = await kv.incrementThrottle('signin:' + email);
    if (count > THROTTLE_LIMIT) {
      return res.status(429).json({ error: 'too_many_requests', retry_after_seconds: 900 });
    }

    const user = await kv.getUser(email);
    if (!user) {
      // Email-enum-resistant: identical 200 whether or not the account exists,
      // and identical to the reset flow's, so the two cannot be diffed either.
      return res.status(200).json({ ok: true, message: 'If that email has an account, a sign-in link is on its way.' });
    }

    const token = generateMagicLinkToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
    await kv.setAuthToken(
      token,
      { email, purpose: 'signin', expires_at: expiresAt, created_at: new Date().toISOString() },
      TOKEN_TTL_SECONDS
    );

    const baseUrl = process.env.BASE_URL || 'https://crads-ai.com';
    const link = `${baseUrl}/api/auth/verify-token?token=${token}`;
    await resend.emails.send({
      from: AUTH_FROM,
      to: email,
      subject: 'Your crads-ai sign-in link',
      html: `<p>Hi,</p>
<p>Click here to sign in: <a href="${link}">${link}</a></p>
<p>This link expires in 15 minutes and can only be used once. It signs you in on this device and changes nothing else: your password still works, and your other machines stay signed in.</p>
<p>If you didn't ask for it, you can ignore this email.</p>
<p>— Sam</p>`,
    });

    return res.status(200).json({ ok: true, message: 'If that email has an account, a sign-in link is on its way.' });
  };
}

module.exports = { makeHandler, THROTTLE_LIMIT, TOKEN_TTL_SECONDS };
