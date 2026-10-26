// api/r.js — crads-ai.com/r/<slug>, a partner's referral link (2026-10-16).
// A live partner slug sets the crads_ref cookie for 90 days, unless one is
// already set (first touch wins, so two partners never dispute a buyer).
// Then it goes to the home page, or, for a host's link (2026-10-22),
// ?to=roadmap&code=X goes to the roadmap booking page with the code filled
// in. An unknown or retired slug sets nothing and still lands, so a
// mistyped link is never a dead end.
'use strict';

const { partnerFor, refFromCookie, formatCookieValue, setCookieHeader, landingFor } = require('../lib/referrals');

module.exports = (req, res) => {
  const slug = String((req.query && req.query.slug) || '');
  const partner = partnerFor(slug);
  if (partner && !refFromCookie(req.headers && req.headers.cookie)) {
    res.setHeader('Set-Cookie', setCookieHeader(formatCookieValue(partner.slug)));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Location', landingFor(req.query && req.query.to, req.query && req.query.code));
  res.status(302).end();
};
