// api/who-else.js: POST from /thanks after a guided setup (2026-10-21, Sam's
// ruling: ask "Who else could do this with you?" at purchase, then a
// three-way intro). The buyer names someone; Sam gets an email so he can
// introduce the three of them. Nothing is sent to the person named, and
// nothing about them is stored on the site.
//
// The session id is Stripe's unguessable token from the success_url (the
// same one /api/booking-status and /api/invoice-link take), checked with
// Stripe: only a completed guided setup checkout can send, a few times at most.
'use strict';

const { retrieveCheckoutSession } = require('../lib/stripe');
const { sendSamAlert } = require('../lib/email');
const { defaultKv } = require('../lib/kv');

const SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;
const MAX_PER_SESSION = 5;
const SKUS = new Set(['guided-setup']);

function clean(s) {
  return String(s || '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  let body;
  try { body = parseBody(req); } catch { res.status(400).json({ error: 'invalid_json' }); return; }

  const sessionId = String(body.session_id || '');
  const name = clean(body.name);
  const email = String(body.email || '').trim().toLowerCase();
  if (!SESSION_RE.test(sessionId)) { res.status(400).json({ error: 'bad_session_id' }); return; }
  if (!name) { res.status(400).json({ error: 'missing_name' }); return; }
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) { res.status(400).json({ error: 'invalid_email' }); return; }

  let session;
  try { session = await retrieveCheckoutSession(sessionId); }
  catch { res.status(400).json({ error: 'bad_session_id' }); return; }
  const meta = (session && session.metadata) || {};
  if (!session || session.status !== 'complete' || !SKUS.has(meta.sku)) {
    res.status(403).json({ error: 'not_eligible' });
    return;
  }

  try {
    const n = await defaultKv().countWhoElse(sessionId);
    if (n > MAX_PER_SESSION) { res.status(429).json({ error: 'too_many' }); return; }
  } catch (err) {
    // A KV outage should not lose the name: send anyway.
    console.error('[who-else] count failed', err && err.message);
  }

  const buyerEmail = (session.customer_details && session.customer_details.email) || session.customer_email || '';
  const buyerName = clean(meta.name) || buyerEmail;
  try {
    await sendSamAlert({
      subject: `who else: ${buyerName} named ${name}`,
      body: `${buyerName} (${buyerEmail}) just bought a guided setup and answered "Who else could do this with you?":

  ${name}${email ? ` <${email}>` : ' (no email given)'}

Next: a three-way intro email to both of them (Idris drafts, you send). Nothing has been sent to ${name}.
Checkout session ${sessionId}.`,
    });
  } catch (err) {
    console.error('[who-else] alert failed', err && err.message);
    res.status(502).json({ error: 'send_failed' });
    return;
  }
  res.status(200).json({ ok: true });
};
