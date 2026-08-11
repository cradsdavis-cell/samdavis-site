'use strict';
const crypto = require('crypto');
const { getAuthUrl } = require('../../../lib/googleAuth');
const { safeNext } = require('../../../lib/safeNext');

module.exports = async function handler(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  const cookies = [`oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`];

  // Carry the destination across the round trip to Google (QA finding 46). It
  // rides in a cookie rather than the `state` parameter because state is
  // compared byte-for-byte against the cookie as the CSRF check, and packing a
  // payload into it means either weakening that comparison or parsing
  // attacker-influenced data before the check has passed. Validated on the way
  // in AND again on the way out, since a cookie is not a trusted channel.
  const url = new URL(req.url || '/', 'https://placeholder.invalid');
  const next = safeNext(url.searchParams.get('next'));
  if (next) {
    cookies.push(`oauth_next=${encodeURIComponent(next)}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);
  }

  res.setHeader('Set-Cookie', cookies);
  res.writeHead(302, { Location: getAuthUrl(state) });
  res.end();
};
