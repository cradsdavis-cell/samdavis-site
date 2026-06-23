'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderHeroCard, fmtDate } = require('../../lib/journeyTracker');
const { fetchNextSession } = require('../../lib/calBookings');
const { computeBalance } = require('../../lib/sessionBalance');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  // If onboarding incomplete, redirect to onboarding stepper
  if (user.state === 'onboarding-incomplete') {
    return res.redirect(302, '/account/onboarding');
  }

  const nextSession = await fetchNextSession(user.email).catch(() => null);
  const balance = computeBalance(user);
  const heroHtml = renderHeroCard({ user, nextSession, balance });

  // "Your sessions" — what's next + where they stand + a one-click book (state-aware).
  const nextLine = nextSession
    ? `<strong>Next session:</strong> ${fmtDate(nextSession.date)}`
    : `<strong>Next session:</strong> nothing booked yet.`;
  const balanceLine = balance.hasBlock
    ? `<br><strong>Block:</strong> ${balance.used} of ${balance.total} sessions used · ${balance.remaining} left to book.`
    : (balance.isRetainer ? `<br><strong>Retainer:</strong> active — two sessions a month.` : '');
  const bookBtn = balance.bookable
    ? `<a href="/account/book" class="cta">${balance.isRetainer ? 'Book a session →' : 'Book your next session →'}</a>`
    : '';
  const sessionsPanel = `
    <section class="panel">
      <div class="panel-title">Your sessions</div>
      <div class="panel-content">${nextLine}${balanceLine}</div>
      ${bookBtn}
      <div class="panel-content"><a href="/account/sessions">See all sessions →</a></div>
    </section>`;

  const driveHref = typeof user.drive_folder_url === 'string' && /^https?:\/\//i.test(user.drive_folder_url)
    ? user.drive_folder_url.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    : null;
  const materialsPanel = `
    <section class="panel">
      <div class="panel-title">Your materials</div>
      <div class="panel-content">
        <a href="/account/packs">Packs &amp; guides →</a>${driveHref ? ` · <a href="${driveHref}" target="_blank" rel="noopener">Your Drive folder →</a>` : ''}
      </div>
    </section>`;

  const mainContent = `
    <h1 class="serif">Home</h1>
    ${heroHtml}
    ${sessionsPanel}
    ${materialsPanel}
    <section class="panel">
      <div class="panel-title">Quick links</div>
      <div class="panel-content">
        <a href="/account/sessions">Sessions</a> ·
        <a href="/account/book">Book</a> ·
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
