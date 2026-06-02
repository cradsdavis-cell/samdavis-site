'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  // If onboarding incomplete, redirect to onboarding stepper
  if (user.state === 'onboarding-incomplete') {
    return res.redirect(302, '/account/onboarding');
  }

  const mainContent = `
    <h1 class="serif">Home</h1>
    <div class="hero-card">
      <div class="label">Right now</div>
      <div class="title">${user.state}</div>
      <div class="meta">(Hero card content per state lands in Phase 5)</div>
    </div>
    <section class="panel">
      <div class="panel-title">Quick links</div>
      <div class="panel-content">
        <a href="/account/sessions">Sessions</a> ·
        <a href="/account/packs">Packs</a> ·
        <a href="/account/subscription">Subscription</a>
      </div>
    </section>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Home',
    activeRoute: 'home',
    isAdmin: isAdmin(user.email),
    mainContent,
  }));
};
