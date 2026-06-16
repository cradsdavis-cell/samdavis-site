'use strict';
const { SKUS } = require('./skus');
const { calManageUrl } = require('./calBookings');

// Only these SKUs book a Cal slot from inside the account (group = cohort,
// retainer = out-of-band).
const BOOKABLE = [
  { slug: 'single-session', name: 'Single Session', blurb: 'One specific pain, one working piece.' },
  { slug: 'coaching-block', name: 'Coaching Block', blurb: 'Four 1:1 sessions, full personalised pack between each.' },
];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtPrice(aud) {
  return '$' + Number(aud).toLocaleString('en-US');
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
}

function renderBookCta() {
  return `<a href="/account/book" class="cta">Book another session →</a>`;
}

function renderBookChoices(user) {
  const cards = BOOKABLE.map(s => {
    const def = SKUS[s.slug];
    return `
      <div class="book-card">
        <h2>${esc(s.name)}</h2>
        <div class="meta">${fmtPrice(def.price_aud)} AUD</div>
        <p class="for">${esc(s.blurb)}</p>
        <a class="book-cta" href="/account/book?sku=${esc(s.slug)}">Pick a time →</a>
      </div>`;
  }).join('');
  return `
    <h1 class="serif">Book a session</h1>
    <div class="book-grid">${cards}</div>
    <section class="panel">
      <div class="panel-title">Other options</div>
      <div class="panel-content">
        <a href="/group">Group Block — next cohort →</a> ·
        <a href="/offer">Continuation Retainer →</a>
      </div>
    </section>`;
}

function renderBookPicker(user, sku) {
  const def = SKUS[sku];
  if (!def || !BOOKABLE.some(b => b.slug === sku)) {
    throw new Error(`not a slot-bookable sku: ${sku}`);
  }
  // Escape '<' so a name containing '</script>' can't break out of the inline <script>.
  const identity = JSON.stringify({ name: user.name || '', email: user.email }).replace(/</g, '\\u003c');
  const name = BOOKABLE.find(b => b.slug === sku).name;
  return `
    <p><a href="/account/book">← All options</a></p>
    <div class="book-header">
      <h1>${esc(name)}</h1>
      <p>${fmtPrice(def.price_aud)} AUD · pay on booking. Booking as ${esc(user.email)}.</p>
    </div>
    <div id="slot-picker"></div>
    <script>window.SKU_SLUG='${esc(sku)}';window.IS_PAID=true;window.BOOK_IDENTITY=${identity};window.LOCK_IDENTITY=true;</script>
    <script src="/book/_slot-picker.js"></script>`;
}

function renderUpcomingBooking(b) {
  const title = (b.eventType && b.eventType.title) || b.title || 'Session';
  const manage = calManageUrl(b.uid);
  return `<li>${esc(title)} — ${esc(fmtDate(b.start))}
    ${b.uid ? `· <a href="${manage}" target="_blank" rel="noopener">Reschedule or cancel</a> <span class="hint">(24h notice policy)</span>` : ''}</li>`;
}

module.exports = { renderBookChoices, renderBookPicker, renderUpcomingBooking, renderBookCta, BOOKABLE };
