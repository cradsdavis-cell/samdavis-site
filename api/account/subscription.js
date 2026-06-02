'use strict';
const Stripe = require('stripe');
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  let portalUrl = null;
  let portalError = null;
  if (user.stripe_customer_id) {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${process.env.BASE_URL || 'https://crads-ai.com'}/account/subscription`,
      });
      portalUrl = session.url;
    } catch (e) {
      portalError = e.message;
    }
  }

  const engagementRows = (user.engagements || []).map(e => `
    <tr>
      <td>${e.type}</td>
      <td>${e.active ? 'Active' : (e.completed ? 'Completed' : 'Purchased')}</td>
      <td>${(e.purchased_at || e.started_at || '').split('T')[0]}</td>
    </tr>
  `).join('');

  const mainContent = `
    <h1 class="serif">Subscription</h1>
    <section class="panel">
      <div class="panel-title">Your engagements</div>
      <table class="engagements-table"><thead><tr><th>Type</th><th>Status</th><th>Since</th></tr></thead>
      <tbody>${engagementRows || '<tr><td colspan="3">No engagements.</td></tr>'}</tbody></table>
    </section>
    <section class="panel">
      <div class="panel-title">Billing + payment methods</div>
      <div class="panel-content">Update payment method, view invoices, cancel subscription — all via Stripe.</div>
      ${portalUrl ? `<a href="${portalUrl}" class="cta" target="_blank" rel="noopener">Manage in Stripe →</a>` : (portalError ? `<p class="error">Couldn't open Stripe portal: ${portalError}</p>` : `<p class="panel-content">Stripe customer not linked yet — contact Sam.</p>`)}
    </section>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Subscription', activeRoute: 'subscription',
    isAdmin: isAdmin(user.email), mainContent,
  }));
};
