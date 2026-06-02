'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ADMIN_EMAIL = 'cradsdavis@gmail.com';

function generateMagicLinkToken() {
  return crypto.randomBytes(32).toString('hex');
}

function signSession(payload, opts = {}) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: opts.expiresIn || '7d',
  });
}

function verifySession(token) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (e) {
    return null;
  }
}

function formatSessionCookie(jwtString) {
  return `session_jwt=${jwtString}; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`;
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
};
