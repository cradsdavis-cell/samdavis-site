'use strict';
const { requireAdmin } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { createOrUpdateUser } = require('../../lib/createOrUpdateUser');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin({ kv: defaultKv(), req, res });
  if (!admin) return;

  const { email, name, stripe_customer_id, sku, initial_state, cohort_id } = req.body || {};
  if (!email) return res.status(400).json({ error: 'missing_email' });

  const kv = defaultKv();
  const { user } = await createOrUpdateUser({
    kv, resend, email, name,
    stripeCustomerId: stripe_customer_id || null,
    sku: sku || 'coaching-block',
    stripeSessionId: null,
    cohortId: cohort_id || null,
  });

  if (initial_state) {
    user.state = initial_state;
    user.state_updated_at = new Date().toISOString();
    await kv.setUser(email, user);
  }

  return res.redirect(302, `/account/admin/client?email=${encodeURIComponent(email)}`);
};
