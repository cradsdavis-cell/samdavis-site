// lib/linkedinPost.js — reusable LinkedIn post embed helper
// Per coaching co-primary spec § 3.3 (testimonials surface).
'use strict';

/**
 * Build LinkedIn embed iframe HTML from a public LinkedIn post URL.
 *
 * Extracts the activity URN (15-25 digit numeric ID following "activity-")
 * and wraps it in LinkedIn's embed iframe URL pattern:
 *   https://www.linkedin.com/embed/feed/update/urn:li:share:{URN}?compact=1
 *
 * @param {string} url - public LinkedIn post URL
 *   (e.g. https://www.linkedin.com/posts/abbey-example_activity-7123456789012345678-AbCd)
 * @returns {string|null} iframe HTML string, or null if URL not parseable.
 */
function linkedInPostEmbed(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/activity-(\d{15,25})/);
  if (!match) return null;
  const urn = match[1];
  const src = `https://www.linkedin.com/embed/feed/update/urn:li:share:${urn}?compact=1`;
  return `<iframe title="LinkedIn post embed" src="${src}" width="100%" height="400" frameborder="0" allowfullscreen loading="lazy" style="border:none;max-width:504px;"></iframe>`;
}

module.exports = { linkedInPostEmbed };
