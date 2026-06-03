'use strict';
const { Resend } = require('resend');
const { requireAdmin } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { generateMagicLinkToken } = require('../../lib/auth');

const resend = new Resend(process.env.RESEND_API_KEY);
const TOKEN_TTL_SECONDS = 900;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin({ kv: defaultKv(), req, res });
  if (!admin) return;

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'missing_email' });

  const kv = defaultKv();
  const user = await kv.getUser(email);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const token = generateMagicLinkToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  await kv.setAuthToken(token, { email, expires_at: expiresAt, created_at: new Date().toISOString() }, TOKEN_TTL_SECONDS);

  const baseUrl = process.env.BASE_URL || 'https://crads-ai.com';
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: 'Sign in to your crads-ai account (resent by Sam)',
    html: `<p>Hi,</p><p>Here's a fresh sign-in link: <a href="${baseUrl}/account/verify?token=${token}">${baseUrl}/account/verify?token=${token}</a></p><p>Expires in 15 minutes.</p><p>— Sam</p>`,
  });

  return res.redirect(302, `/account/admin/client?email=${encodeURIComponent(email)}&resent=1`);
};
