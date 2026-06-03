'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ADMIN_EMAIL = 'cradsdavis@gmail.com';
const SESSION_TTL_DAYS = 60;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60; // 5184000

function generateMagicLinkToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt: salt.toString('hex') };
}

function verifyPassword(password, hashHex, saltHex) {
  if (!hashHex || !saltHex) return false;
  let stored, derived;
  try {
    stored = Buffer.from(hashHex, 'hex');
    derived = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64);
  } catch (e) { return false; }
  return stored.length === derived.length && crypto.timingSafeEqual(stored, derived);
}

function shouldRefreshSession(payload) {
  if (!payload || !payload.iat || !payload.exp) return false;
  return Date.now() / 1000 > (payload.iat + payload.exp) / 2;
}

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  if (secret.length < 32) throw new Error('SESSION_SECRET too short (need 32+ chars)');
  return secret;
}

// ReDoS-safe email check: hard length cap + bounded, non-overlapping quantifiers
// (no catastrophic backtracking) + a dot somewhere in the domain.
function isValidEmail(email) {
  if (typeof email !== 'string' || email.length === 0 || email.length > 254) return false;
  if (!/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email)) return false;
  const at = email.indexOf('@');
  const dot = email.indexOf('.', at + 2);
  return dot > -1 && dot < email.length - 1;
}

function signSession(payload, opts = {}) {
  const secret = getSecret();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: opts.expiresIn || `${SESSION_TTL_DAYS}d`,
  });
}

function verifySession(token) {
  const secret = getSecret();
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (e) {
    return null;
  }
}

function formatSessionCookie(jwtString) {
  return `session_jwt=${jwtString}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Path=/`;
}

function formatLogoutCookie() {
  return `session_jwt=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`;
}

function parseSessionFromRequest(req) {
  const cookieHeader = req.headers && req.headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)session_jwt=([^;]+)/);
  return match ? match[1] : null;
}

function isAdmin(email) {
  return email === ADMIN_EMAIL;
}

module.exports = {
  generateMagicLinkToken,
  signSession,
  verifySession,
  formatSessionCookie,
  formatLogoutCookie,
  parseSessionFromRequest,
  isAdmin,
  ADMIN_EMAIL,
  SESSION_TTL_DAYS,
  SESSION_TTL_SECONDS,
  hashPassword,
  verifyPassword,
  shouldRefreshSession,
  isValidEmail,
};
