'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const engagementsList = (user.engagements || []).map(e => `
    <li>${e.type} — purchased ${e.purchased_at ? e.purchased_at.split('T')[0] : 'unknown'}${e.completed ? ' · completed' : ''}</li>
  `).join('');

  const mainContent = `
    <h1 class="serif">Sessions</h1>
    <section class="panel">
      <div class="panel-title">Upcoming</div>
      <div class="panel-content">(Cal.com upcoming bookings will render here in Phase 5)</div>
    </section>
    <section class="panel">
      <div class="panel-title">Past</div>
      <div class="panel-content">(Cal.com past bookings will render here in Phase 5)</div>
    </section>
    <section class="panel">
      <div class="panel-title">Engagements</div>
      <ul class="panel-content">${engagementsList || '<li>No purchases yet.</li>'}</ul>
    </section>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Sessions', activeRoute: 'sessions',
    isAdmin: isAdmin(user.email), mainContent,
  }));
};
