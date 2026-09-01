'use strict';
// lib/inviteSend.js — the courier for a mineral's access invitation.
//
// WHY THIS MOVED HERE. It used to live on the box (ai-os engine/box/
// invite-email.mjs), sending from the rock's own Resend key, on the principle
// that "the platform should not be the thing that emails an organisation's
// members". Good principle, wrong case, and the cost was total: a newborn rock
// has no Resend key, so sendInvite returned { sent: false, why: 'this mineral
// has no mail key, so send the link yourself' } and NO ROCK COULD EVER DELIVER
// AN INVITATION. The two-account flow stalled at step one unless a human copied
// the link out of a JSON field (QA finding 41, 2026-08-11).
//
// Sam's ruling, 2026-08-12: the site sends it. An invitation is a platform
// account action — this address may now reach this mineral, go and sign in —
// not organisation content. Nothing about the org's own brain passes through
// here, and the alternative (a Resend key provisioned and rotated per rock)
// buys a principle at the price of the feature.
//
// WHO IS ALLOWED TO CALL IT. Not the box directly: the site has no way to check
// a mineral token, because it cannot read the directory's mineral records. The
// chain is box -> directory -> here. The directory already holds each mineral's
// token_hash and already authenticates the box against it on /mineral-register,
// so it is the one party that can say "this really is that mineral speaking".
// This endpoint therefore trusts exactly one caller, proven by one shared
// secret, and fails CLOSED when that secret is unset: an unset token must never
// mean an open mail relay.
//
// WHAT THE LINK CARRIES: the community handle, and nothing else that matters.
// No token, no secret, no expiry to explain. The address you are signed in as
// decides the outcome at the far end (api/app/access.js), so a forwarded link
// is worthless to whoever receives it and harmless to whoever sent it.

const { AUTH_FROM } = require('./email');

const SITE = process.env.BASE_URL || 'https://crads-ai.com';
const ORG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

const accessLink = (org, site = SITE) => `${site}/access?org=${encodeURIComponent(org)}`;

/**
 * Plain words, no marketing, and it says what will happen. The recipient may
 * never have heard of Crads-AI, so it names who invited them and to what before
 * it asks for anything.
 *
 * This is the ONE copy of this text. The box's version goes when the directory
 * half lands: two copies of a message drift silently, and the drift shows up in
 * somebody's inbox rather than in a test.
 */
function inviteText({ org, orgDisplay, inviterName, link }) {
  const who = inviterName ? `${inviterName} has` : `${orgDisplay || org} has`;
  return [
    `${who} given you access to ${orgDisplay || org} on Crads-AI.`,
    '',
    'Open this to accept:',
    `   ${link}`,
    '',
    'You will be asked to sign in. It has to be THIS email address:',
    'the link on its own does nothing, and the address is what proves it is you.',
    '',
    'If you do not have an account yet, signing in will make you one.',
    '',
    'Nothing is shared with you until you accept, and you can be removed at any',
    'time by whoever invited you.',
    '',
    'Crads-AI',
  ].join('\n');
}

function bearer(req) {
  const h = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1].trim() : '';
}

// Constant-time-ish compare. The secret is high-entropy and the endpoint is
// throttled, so this is belt-and-braces rather than load-bearing, but a plain
// === on a secret is the kind of thing that reads badly in a security review
// for no gain.
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function makeHandler({ resend, secret = process.env.INVITE_SEND_TOKEN, site = SITE } = {}) {
  return async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    // Fail CLOSED. An unset secret is a misconfiguration, and the safe reading
    // of a misconfigured mail relay is "refuse", never "allow anyone".
    if (!secret) {
      return res.status(503).json({ error: 'not_configured', message: 'The invitation sender is not configured.' });
    }
    if (!tokenMatches(bearer(req), secret)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const b = (req && req.body) || {};
    const to = typeof b.to === 'string' ? b.to.trim().toLowerCase() : '';
    const org = typeof b.org === 'string' ? b.org.trim().toLowerCase() : '';
    const orgDisplay = typeof b.orgDisplay === 'string' ? b.orgDisplay.trim().slice(0, 120) : '';
    const inviterName = typeof b.inviterName === 'string' ? b.inviterName.trim().slice(0, 120) : '';

    if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'invalid_recipient' });
    if (!ORG_RE.test(org)) return res.status(400).json({ error: 'invalid_org' });

    const link = accessLink(org, site);

    // A grant is ALREADY REAL on the box by the time this runs. A failed email
    // must therefore never read as a failed grant: the link comes back on every
    // path so the caller can surface it and a human can carry it by hand.
    try {
      const result = await resend.emails.send({
        from: AUTH_FROM,
        to,
        subject: `You have been given access to ${orgDisplay || org}`,
        text: inviteText({ org, orgDisplay, inviterName, link }),
      });
      if (result && result.error) {
        return res.status(502).json({ ok: false, sent: false, link, why: String(result.error.message || 'the mail service refused it') });
      }
      return res.status(200).json({ ok: true, sent: true, link });
    } catch (e) {
      return res.status(502).json({ ok: false, sent: false, link, why: String((e && e.message) || e) });
    }
  };
}

module.exports = { makeHandler, inviteText, accessLink };
