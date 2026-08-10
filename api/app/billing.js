'use strict';
// /app/billing — what this account pays for (arc A4).
const Stripe = require('stripe');
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { billingView } = require('../../lib/appBilling');
const { directoryFor } = require('../../lib/directory');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const view = await billingView({ user, stripe, baseUrl: process.env.BASE_URL });

  // Rocks this account operates, so the rock-billing card can name them rather
  // than talk about them in the abstract. Read-only, fail-soft.
  const edges = await directoryFor(user).edges();
  const rocks = edges.ok
    ? edges.edges.filter((e) => e.tier === 'rock' || e.role === 'admin').map((e) => e.org_display || e.org)
    : null;

  const rows = (view.engagements || []).map((e) => `<div class="card">
  <h2>${escapeHtml(e.type || 'engagement')}</h2>
  <div class="sub">${e.active ? 'active' : (e.completed ? 'completed' : 'purchased')}${
    (e.purchased_at || e.started_at) ? ` &middot; ${escapeHtml(String(e.purchased_at || e.started_at).split('T')[0])}` : ''}</div>
</div>`).join('');

  const portalCard = view.portalUrl
    ? `<a class="act" href="${escapeHtml(view.portalUrl)}" target="_blank" rel="noopener">Manage billing in Stripe</a>
       <p class="note">Payment methods, invoices and cancellations all live there.</p>`
    : view.portalError
      ? `<p class="note">Stripe could not open the portal just now: ${escapeHtml(view.portalError)}</p>`
      : '<p class="note">No payment method is linked to this account yet. Nothing is being charged.</p>';

  const rockCard = rocks === null
    ? '<div class="sub">Could not read which rocks this account operates just now.</div>'
    : rocks.length
      ? `<div class="sub">You operate ${rocks.map((r) => `<b>${escapeHtml(r)}</b>`).join(', ')}. Per-seat billing for a rock&#8217;s members is not itemised here yet: the platform ledger cannot yet be read per owner, and pricing is not armed. Nothing is being charged for these seats today.</div>`
      : '<div class="sub">This account does not operate a rock. If you start one, its seats are billed here.</div>';

  const main = `<h1>Billing</h1>
<p class="lead">What this account pays for. One account, one card, whatever it holds.</p>
<div class="card">
  <h2>Payment</h2>
  ${portalCard}
</div>
${rows ? `<h1 style="margin-top:1.6em;font-size:1.15em">Your engagements</h1>${rows}` : ''}
<div class="card">
  <h2>Rocks you operate</h2>
  ${rockCard}
</div>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Billing', active: 'billing', email: user.email, main }));
};
