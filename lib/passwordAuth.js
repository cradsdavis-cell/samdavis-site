// lib/passwordAuth.js — email/password sign-in cores (DI-friendly)
//
// Three handler factories fronted by thin Vercel adapters under api/auth/.
// Security: register NEVER mutates a pre-existing account (account-takeover
// guard); a password can only land on an existing account via the reset token
// (proves mailbox ownership) or a valid session. Generic errors on the login
// path (no email enumeration). scrypt hashing lives in lib/auth.js.
'use strict';
const { hashPassword, verifyPassword, signSession, formatSessionCookie,
        parseSessionFromRequest, verifySession, isValidEmail } = require('./auth');

const MIN_PASSWORD = 10;
const MAX_PASSWORD = 1024;
const THROTTLE_LIMIT = 5;
const BAD_CREDS = { error: 'invalid_credentials' };

function validatePasswordStrength(pw) {
  return typeof pw === 'string' && pw.length >= MIN_PASSWORD && pw.length <= MAX_PASSWORD;
}

function clientIp(req) {
  const xff = req && req.headers && req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

// Email is the canonical account key — normalize case + whitespace everywhere
// so "User@X.com" and "user@x.com" never become two accounts (matches googleAuth).
function normEmail(req) {
  const e = req && req.body && req.body.email;
  return typeof e === 'string' ? e.trim().toLowerCase() : '';
}

// Mirrors the new-user shape in lib/createOrUpdateUser.js so the onboarding
// stepper works identically for self-signups.
function blankUser(email) {
  const now = new Date().toISOString();
  return {
    email, created_at: now, name: null, stripe_customer_id: null,
    state: 'onboarding-incomplete', state_updated_at: now, state_version: 1,
    engagements: [],
    onboarding: { step: 1, completed: false,
      install_checklist: { claude_code: false, vs_code: false, obsidian: false, cal_app: false, slack: false },
      context_worksheet: null },
    cohort_id: null, notes_from_sam: null,
  };
}

function setSession(res, email, stateVersion) {
  res.setHeader('Set-Cookie', formatSessionCookie(signSession({ email, state_version: stateVersion || 1 })));
}

function preflight(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || 'https://crads-ai.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return false; }
  return true;
}

function makeRegisterHandler({ kv }) {
  return async (req, res) => {
    if (!preflight(req, res)) return;
    const email = normEmail(req);
    const { password } = req.body || {};
    if (!email || !isValidEmail(email) || !validatePasswordStrength(password)) {
      return res.status(400).json({ error: 'invalid_input', message: `Enter a valid email and a password of 10–1024 characters.` });
    }
    if (await kv.incrementThrottle('register:' + clientIp(req)) > THROTTLE_LIMIT) {
      return res.status(429).json({ error: 'too_many_requests', retry_after_seconds: 900 });
    }
    const existing = await kv.getUser(email);
    if (existing) {
      // Takeover guard: never set a password on an account we didn't just create.
      return res.status(409).json({ error: 'account_exists', message: 'An account with that email already exists — sign in, or use “Forgot password”.' });
    }
    const user = blankUser(email);
    const { hash, salt } = hashPassword(password);
    user.password_hash = hash; user.password_salt = salt;
    user.signup_source = 'password'; user.email_verified = false;
    await kv.setUser(email, user);
    setSession(res, email, 1);
    return res.status(200).json({ ok: true, redirect: '/account/' });
  };
}

function makeLoginHandler({ kv }) {
  return async (req, res) => {
    if (!preflight(req, res)) return;
    const email = normEmail(req);
    const { password } = req.body || {};
    if (!email || !isValidEmail(email) || typeof password !== 'string') {
      return res.status(401).json(BAD_CREDS);
    }
    // IP-scoped bucket so an attacker can't lock a victim out by their email alone.
    const count = await kv.incrementThrottle('login:' + clientIp(req) + ':' + email);
    if (count > THROTTLE_LIMIT) return res.status(429).json({ error: 'too_many_requests', retry_after_seconds: 900 });
    const user = await kv.getUser(email);
    if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json(BAD_CREDS);
    }
    setSession(res, email, user.state_version || 1);
    return res.status(200).json({ ok: true, redirect: '/account/' });
  };
}

function makeSetPasswordHandler({ kv }) {
  return async (req, res) => {
    if (!preflight(req, res)) return;
    const { token, password } = req.body || {};
    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ error: 'weak_password', message: `Password must be 10–1024 characters.` });
    }
    if (await kv.incrementThrottle('setpw:' + clientIp(req)) > THROTTLE_LIMIT) {
      return res.status(429).json({ error: 'too_many_requests', retry_after_seconds: 900 });
    }
    let email = null;
    if (token) {
      const rec = await kv.getAuthToken(token);
      // Fail closed: a set-password token must exist, carry the right purpose, and be
      // unexpired in-app — never trust the Redis TTL alone for this takeover-grade path.
      if (rec && rec.email && rec.purpose === 'set-password' &&
          rec.expires_at && new Date(rec.expires_at) >= new Date()) {
        email = rec.email;
      } else if (rec) {
        await kv.deleteAuthToken(token);
      }
    }
    if (!email) {
      const jwt = parseSessionFromRequest(req);
      const payload = jwt && verifySession(jwt);
      if (payload && payload.email) email = payload.email;
    }
    if (!email) return res.status(401).json({ error: 'unauthorized' });
    const user = await kv.getUser(email);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const { hash, salt } = hashPassword(password);
    user.password_hash = hash; user.password_salt = salt;
    // Credential change → bump state_version to invalidate all other outstanding sessions.
    user.state_version = (user.state_version || 1) + 1;
    await kv.setUser(email, user);
    if (token) await kv.deleteAuthToken(token);
    setSession(res, email, user.state_version);
    return res.status(200).json({ ok: true, redirect: '/account/' });
  };
}

module.exports = { makeLoginHandler, makeRegisterHandler, makeSetPasswordHandler,
                   validatePasswordStrength, blankUser, clientIp, MIN_PASSWORD, THROTTLE_LIMIT };
