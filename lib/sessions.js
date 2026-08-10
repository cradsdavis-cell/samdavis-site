'use strict';
// lib/sessions.js — every sign-in becomes a listed, revocable device (arc A3,
// ruling 9's sessions half, 2026-08-10).
//
// Before this, a session was only a signed JWT: nothing could LIST what was
// signed in, and nothing could revoke ONE machine — the only lever was
// state_version, which signs out everything at once. Now every issue writes a
// registry row and puts its id (`sid`) inside the JWT, so:
//   - /app/devices can show the machines,
//   - revoking a sid makes exactly that JWT dead at the next requireAuth,
//   - sign-out-everywhere stays the state_version bump it always was.
//
// THE DEPLOY-SAFETY RULE, pinned by test: a JWT with NO sid (every session
// issued before this shipped) keeps working untouched. Only a sid that was
// explicitly issued and later revoked is refused. Getting this wrong signs the
// whole world out on deploy.
const crypto = require('crypto');
const { signSession, formatSessionCookie, SESSION_TTL_SECONDS } = require('./auth');

// coarse on purpose: this names a machine for a human, it is not analytics
function uaFamily(ua) {
  const s = String(ua || '');
  if (/crads/i.test(s)) return 'Crads-AI app';
  if (/Edg\//.test(s)) return 'Edge';
  if (/OPR\//.test(s)) return 'Opera';
  if (/Firefox\//.test(s)) return 'Firefox';
  if (/Chrome\//.test(s)) return 'Chrome';
  if (/Safari\//.test(s)) return 'Safari';
  return s ? 'Browser' : 'Unknown device';
}
function osFamily(ua) {
  const s = String(ua || '');
  if (/Windows/.test(s)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(s)) return 'Mac';
  if (/Android/.test(s)) return 'Android';
  if (/iPhone|iPad/.test(s)) return 'iOS';
  if (/Linux/.test(s)) return 'Linux';
  return '';
}

/**
 * Issue a session AND register it. The one path every login flow calls, so a
 * sign-in cannot exist that the Devices page does not know about.
 * @returns {{ jwt, sid, cookie }}
 */
async function issueSession({ kv, email, stateVersion, label, userAgent }) {
  const sid = crypto.randomBytes(12).toString('hex');
  const ua = uaFamily(userAgent);
  const os = osFamily(userAgent);
  await kv.setSession(email, sid, {
    sid,
    label: String(label || [ua, os].filter(Boolean).join(' on ') || 'This device').slice(0, 80),
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  }, SESSION_TTL_SECONDS);
  const jwt = signSession({ email, state_version: stateVersion || 1, sid });
  return { jwt, sid, cookie: formatSessionCookie(jwt) };
}

/**
 * Is this JWT's session still welcome? Called by requireAuth on every request.
 *   - no sid on the payload → legacy session → welcome (deploy safety);
 *   - sid present and registered → welcome, and last_seen is touched
 *     (throttled to ~once a minute so reads do not hammer the store);
 *   - sid present and NOT registered → it was revoked → refused.
 */
async function sessionWelcome({ kv, payload }) {
  if (!payload || !payload.sid) return { welcome: true, legacy: true };
  const row = await kv.getSession(payload.email, payload.sid);
  if (!row) return { welcome: false };
  const last = Date.parse(row.last_seen || 0) || 0;
  if (Date.now() - last > 60 * 1000) {
    row.last_seen = new Date().toISOString();
    // fire-and-forget with the TTL refreshed: an active session's row lives
    // exactly as long as its rolling cookie does
    kv.setSession(payload.email, payload.sid, row, SESSION_TTL_SECONDS).catch(() => {});
  }
  return { welcome: true, row };
}

module.exports = { issueSession, sessionWelcome, uaFamily, osFamily };
