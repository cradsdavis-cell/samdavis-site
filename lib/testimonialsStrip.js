// lib/testimonialsStrip.js — render helper for the testimonials strip
// Per coaching co-primary spec § 3.3. Empty-state aware: renders only when
// >= 3 testimonials exist (avoids "thin proof" anti-signal).
'use strict';

const { linkedInPostEmbed } = require('./linkedinPost');
const { testimonials } = require('./testimonials');

/**
 * Build the testimonials strip HTML.
 * Returns an empty string if fewer than 3 testimonials exist.
 * Silently filters out any testimonial whose URL fails to parse.
 *
 * @returns {string} strip HTML, or '' if below threshold.
 */
function testimonialsStripHTML() {
  if (testimonials.length < 3) return '';
  const cards = testimonials
    .map((t) => {
      const embed = linkedInPostEmbed(t.url);
      if (!embed) return '';
      return `
      <div class="testimonial-card">
        ${embed}
        <div class="attribution"><strong>${escapeHTML(t.clientName)}</strong> — ${escapeHTML(t.role)}</div>
      </div>
    `;
    })
    .join('');
  return `
    <section class="testimonials-strip">
      <h2>What people are saying</h2>
      <div class="grid">${cards}</div>
    </section>
  `;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

module.exports = { testimonialsStripHTML };
