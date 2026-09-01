// lib/downloadGate.js - the beta password gate on /download.
//
// WHAT THIS IS AND IS NOT. This keeps the download page off the open web while
// the beta is invite-only. It is NOT a licence check and it does not make the
// app private: the release assets live in the PUBLIC repo cradsdavis-cell/
// crads-ai-app, so anyone holding an asset URL can still fetch the binary
// without ever seeing this page. Treat it as a closed-beta doormat, not a lock.
//
// The password is read from the DOWNLOAD_PASSWORD environment variable and is
// deliberately absent from this repo, which is public: a literal here would sit
// in git history for good and anyone reading the source would walk straight
// past the gate. No env var means the gate refuses everyone (fail closed), so a
// misconfiguration can never silently publish the page.
'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const COOKIE = 'crads_beta';
const TTL_SECONDS = 60 * 60 * 24 * 30;   // a month: long enough that a beta member types it once

function secret() {
  const v = process.env.DOWNLOAD_PASSWORD;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Normalised so a password read off an email survives the trip: people paste
// trailing spaces and capitalise the first letter on phones. The password is a
// shared beta doormat, not a credential, so widening it costs nothing real.
function normalise(input) {
  return String(input == null ? '' : input).trim().toLowerCase();
}

// The cookie carries an HMAC keyed by the password itself, so it cannot be
// forged by anyone who does not already know the password, and it never
// contains the password.
function tokenFor(password) {
  return createHmac('sha256', password).update('crads-download-gate-v1').digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function passwordMatches(input) {
  const s = secret();
  if (!s) return false;
  return safeEqual(normalise(input), normalise(s));
}

function readCookie(req) {
  const header = (req && req.headers && req.headers.cookie) || '';
  const m = String(header).match(/(?:^|;\s*)crads_beta=([^;]+)/);
  return m ? m[1] : null;
}

function isUnlocked(req) {
  const s = secret();
  if (!s) return false;
  const got = readCookie(req);
  if (!got) return false;
  return safeEqual(got, tokenFor(normalise(s)));
}

function unlockCookie() {
  const s = secret();
  if (!s) return null;
  return `${COOKIE}=${tokenFor(normalise(s))}; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}; Path=/`;
}

module.exports = {
  COOKIE, TTL_SECONDS, secret, normalise, tokenFor, passwordMatches, isUnlocked, unlockCookie,
};
