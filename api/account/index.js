'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderHeroCard } = require('../../lib/journeyTracker');
const { fetchNextSession } = require('../../lib/calBookings');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  // If onboarding incomplete, redirect to onboarding stepper
  if (user.state === 'onboarding-incomplete') {
    return res.redirect(302, '/account/onboarding');
  }

  const nextSession = await fetchNextSession(user.email).catch(() => null);
  const heroHtml = renderHeroCard({ user, nextSession });

  const mainContent = `
    <h1 class="serif">Home</h1>
    ${heroHtml}
    <section class="panel">
      <div class="panel-title">Quick links</div>
      <div class="panel-content">
        <a href="/account/sessions">Sessions</a> ·
        <a href="/account/packs">Packs</a> ·
        <a href="/account/subscription">Subscription</a> ·
        <a href="/account/set-password">Password</a>
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
