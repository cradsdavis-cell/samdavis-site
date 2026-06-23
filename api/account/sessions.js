'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { fetchUpcomingAndPast } = require('../../lib/calBookings');
const { computeBalance } = require('../../lib/sessionBalance');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
}

function renderBookingItem(b) {
  const title = (b.eventType && b.eventType.title) || b.title || 'Session';
  return `<li>${escapeHtml(title)} — ${escapeHtml(fmtDate(b.start))}</li>`;
}

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const { upcoming, past } = await fetchUpcomingAndPast(user.email)
    .catch(() => ({ upcoming: [], past: [], error: true }));

  const upcomingHtml = upcoming.length
    ? `<ul class="panel-content">${upcoming.map(renderBookingItem).join('')}</ul>`
    : `<div class="panel-content">No upcoming bookings.</div>`;

  const pastHtml = past.length
    ? `<ul class="panel-content">${past.map(renderBookingItem).join('')}</ul>`
    : `<div class="panel-content">No past bookings.</div>`;

  const engagementsList = (user.engagements || []).map(e => `
    <li>${escapeHtml(e.type)} — purchased ${e.purchased_at ? escapeHtml(e.purchased_at.split('T')[0]) : 'unknown'}${e.completed ? ' · completed' : ''}</li>
  `).join('');

  const balance = computeBalance(user);
  const booked = req.query && req.query.booked;
  const bookedBanner = booked
    ? `<section class="panel" style="border-left:3px solid #2e7d32;"><div class="panel-content">✓ Session booked — it's on your calendar. You'll get a confirmation from Cal.com.</div></section>`
    : '';
  const balanceHtml = balance.hasBlock
    ? `<div class="panel-content">${balance.used} of ${balance.total} sessions used · <strong>${balance.remaining}</strong> left to book.</div>`
    : (balance.isRetainer ? `<div class="panel-content">Retainer active — two sessions a month.</div>` : `<div class="panel-content">No active block.</div>`);
  const bookBtn = balance.bookable
    ? `<a href="/account/book" class="cta">${balance.isRetainer ? 'Book a session →' : 'Book your next session →'}</a>`
    : '';

  const mainContent = `
    <h1 class="serif">Sessions</h1>
    ${bookedBanner}
    <section class="panel">
      <div class="panel-title">Your balance</div>
      ${balanceHtml}
      ${bookBtn}
    </section>
    <section class="panel">
      <div class="panel-title">Upcoming</div>
      ${upcomingHtml}
    </section>
    <section class="panel">
      <div class="panel-title">Past</div>
      ${pastHtml}
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
