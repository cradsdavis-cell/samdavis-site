'use strict';
const { makeVerifier } = require('../../../lib/googleAuth');
const { signSession, formatSessionCookie } = require('../../../lib/auth');
const { defaultKv } = require('../../../lib/kv');
const { blankUser } = require('../../../lib/passwordAuth');

function readCookie(req, name) {
  const h = req.headers && req.headers.cookie;
  if (!h) return null;
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'https://x');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(req, 'oauth_state');
  const clearState = 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';

  if (!code || !state || !cookieState || state !== cookieState) {
    res.setHeader('Set-Cookie', clearState);
    res.writeHead(302, { Location: '/account/login?error=google' });
    return res.end();
  }

  try {
    const { email, sub } = await makeVerifier()(code);
    const kv = defaultKv();
    let user = await kv.getUser(email);
    if (!user) { user = blankUser(email); user.signup_source = 'google'; }
    user.email_verified = true;
    if (!user.google_sub) user.google_sub = sub;
    await kv.setUser(email, user);
    const session = formatSessionCookie(signSession({ email, state_version: user.state_version || 1 }));
    res.setHeader('Set-Cookie', [clearState, session]);
    res.writeHead(302, { Location: '/account/' });
    res.end();
  } catch (e) {
    res.setHeader('Set-Cookie', clearState);
    res.writeHead(302, { Location: '/account/login?error=google' });
    res.end();
  }
};
