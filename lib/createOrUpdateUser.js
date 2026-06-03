'use strict';
const { generateMagicLinkToken } = require('./auth');

const TOKEN_TTL_SECONDS = 900;

async function createOrUpdateUser({ kv, resend, email, name, stripeCustomerId, sku, stripeSessionId, stripeSubscriptionId, cohortId }) {
  const existing = await kv.getUser(email);
  const now = new Date().toISOString();

  const engagement = {
    type: sku,
    purchased_at: now,
    completed: false,
  };
  if (stripeSessionId) engagement.stripe_session_id = stripeSessionId;
  if (stripeSubscriptionId) {
    engagement.stripe_subscription_id = stripeSubscriptionId;
    engagement.active = true;
    engagement.started_at = now;
  }

  if (existing) {
    existing.engagements = existing.engagements || [];
    existing.engagements.push(engagement);
    if (cohortId) existing.cohort_id = cohortId;
    if (name && !existing.name) existing.name = name;
    if (stripeCustomerId && !existing.stripe_customer_id) existing.stripe_customer_id = stripeCustomerId;
    await kv.setUser(email, existing);
    return { created: false, user: existing };
  }

  const user = {
    email,
    created_at: now,
    name: name || null,
    stripe_customer_id: stripeCustomerId || null,
    state: 'onboarding-incomplete',
    state_updated_at: now,
    state_version: 1,
    engagements: [engagement],
    onboarding: {
      step: 1,
      completed: false,
      install_checklist: {
        claude_code: false, vs_code: false, obsidian: false, cal_app: false, slack: false,
      },
      context_worksheet: null,
    },
    cohort_id: cohortId || null,
    notes_from_sam: null,
  };
  await kv.setUser(email, user);

  if (resend && process.env.RESEND_FROM_EMAIL) {
    const token = generateMagicLinkToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
    await kv.setAuthToken(token, { email, purpose: 'verify', expires_at: expiresAt, created_at: now }, TOKEN_TTL_SECONDS);
    const baseUrl = process.env.BASE_URL || 'https://crads-ai.com';
    const link = `${baseUrl}/account/verify?token=${token}`;
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Welcome to crads-ai — sign in to set up your account',
      html: `<p>Hi${name ? ' ' + name.split(' ')[0] : ''},</p>
<p>Welcome — your payment has been received. Click here to set up your account and book your first session:</p>
<p><a href="${link}">${link}</a></p>
<p>This link expires in 15 minutes. If it expires before you click, request a new one at <a href="${baseUrl}/account/login">${baseUrl}/account/login</a>.</p>
<p>See you in your first session soon.</p>
<p>— Sam</p>`,
    });
  }

  return { created: true, user };
}

module.exports = { createOrUpdateUser, TOKEN_TTL_SECONDS };
