'use strict';
const { makeVerifier } = require('../../../lib/googleAuth');
const { signSession, formatSessionCookie } = require('../../../lib/auth');
const { defaultKv } = require('../../../lib/kv');
const { blankUser } = require('../../../lib/passwordAuth');
const { safeNext } = require('../../../lib/safeNext');

function readCookie(req, name) {
  const h = req.headers && req.headers.cookie;
  if (!h) return null;
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

const clearState = 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
const clearNext = 'oauth_next=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';

// Where start.js was told to send them afterwards. Re-validated here rather
// than trusted: the cookie was ours when we set it, and a cookie is still an
// attacker-influenceable channel by the time it comes back.
function nextFrom(req) {
  const raw = readCookie(req, 'oauth_next');
  if (!raw) return '';
  let decoded = '';
  try { decoded = decodeURIComponent(raw); } catch { return ''; }
  return safeNext(decoded);
}

function bounce(res, reason) {
  res.setHeader('Set-Cookie', clearState);
  res.writeHead(302, { Location: '/account/login?error=google&reason=' + encodeURIComponent(reason) });
  res.end();
}

// Map a token-exchange / verification failure to a coarse, secret-safe reason.
// Detail is logged server-side (Vercel logs); the reason in the URL never leaks
// secrets but distinguishes a config problem (client_config) from a transient one.
function classify(e) {
  const code = e && e.response && e.response.data && e.response.data.error;
  if (code === 'invalid_client' || code === 'unauthorized_client') return 'client_config';
  if (code === 'invalid_grant') return 'code_exchange';
  const msg = (e && e.message) || '';
  if (/id_token/i.test(msg)) return 'no_id_token';
  if (/not verified/i.test(msg)) return 'email_unverified';
  if (/no email/i.test(msg)) return 'no_email';
  return 'exchange_failed';
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'https://x');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(req, 'oauth_state');
  const googleErr = url.searchParams.get('error'); // e.g. access_denied from the consent screen

  if (googleErr) {
    console.error('[google-callback] consent error:', googleErr);
    return bounce(res, 'consent_' + googleErr.replace(/[^a-z_]/gi, ''));
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    console.error('[google-callback] state check failed', { hasCode: !!code, hasState: !!state, hasCookie: !!cookieState, match: state === cookieState });
    return bounce(res, 'state');
  }

  try {
    const { email, sub } = await makeVerifier()(code);
    const kv = defaultKv();
    let user = await kv.getUser(email);
    if (!user) { user = blankUser(email); user.signup_source = 'google'; }
    user.email_verified = true;
    if (!user.google_sub) user.google_sub = sub;
    await kv.setUser(email, user);
    const { issueSession } = require('../../../lib/sessions');
    const { cookie: session } = await issueSession({ kv, email,
      stateVersion: user.state_version || 1, userAgent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', [clearState, clearNext, session]);
    res.writeHead(302, { Location: nextFrom(req) || '/app' });
    res.end();
  } catch (e) {
    const reason = classify(e);
    const detail = (e && e.response && e.response.data) || (e && e.message) || String(e);
    console.error('[google-callback] token/verify failed:', reason, JSON.stringify(detail));
    bounce(res, reason);
  }
};
