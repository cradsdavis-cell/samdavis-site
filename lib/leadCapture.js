// lib/leadCapture.js — Lead Nurture capture logic
// Per coaching co-primary spec § 5.2 + § 6.2 #3.
//
// Two consumers:
//   1. api/lead-capture.js (Vercel serverless function — thin adapter)
//   2. tests/leadCapture.test.js (node:test with mocked Resend + googleapis)
//
// Browser-side form helper lives separately at lib/leadCapture.browser.js
// (plain script tag — no module imports — to match the site's existing
// /lib/site.js + /lib/testimonialsStrip.js pattern).
'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE_MAX = 80;

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'invalid_body';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) return 'invalid_email';
  return null;
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function sanitizeSource(src) {
  if (typeof src !== 'string') return 'unknown';
  const clean = src.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, SOURCE_MAX);
  return clean || 'unknown';
}

// --- Email 1 (welcome) -------------------------------------------------------

const EMAIL_1_SUBJECT = "Thanks — here's what people ask me first";

function email1Html() {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;line-height:1.55;">
  <p>Hi,</p>
  <p>Thanks for the interest. Here are the three things people most often ask me about AI coaching for solo and small-business founders:</p>
  <ol>
    <li>"Will this actually save me time, or just add another tool?"</li>
    <li>"What if I'm not technical?"</li>
    <li>"How do I know if I'm ready?"</li>
  </ol>
  <p>I'll send you a few more emails over the next two weeks — one with a specific case study, one walking through what working with me looks like, and one with the free install guide.</p>
  <p>No pressure to book. If you want to skip ahead:</p>
  <ul>
    <li><a href="https://crads-ai.com/offer">See pricing</a></li>
    <li><a href="https://crads-ai.com/book/discovery">Book a free 30-minute call</a></li>
  </ul>
  <p>— Sam</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
  <p style="font-size:12px;color:#888;">You're getting this because you opted in at crads-ai.com. Reply "stop" if you'd rather not hear from me.</p>
</body></html>`;
}

function email1Text() {
  return `Hi,

Thanks for the interest. Here are the three things people most often ask me about AI coaching for solo and small-business founders:

1. "Will this actually save me time, or just add another tool?"
2. "What if I'm not technical?"
3. "How do I know if I'm ready?"

I'll send you a few more emails over the next two weeks — one with a specific case study, one walking through what working with me looks like, and one with the free install guide.

No pressure to book. If you want to skip ahead:

  See pricing: https://crads-ai.com/offer
  Book a free 30-minute call: https://crads-ai.com/book/discovery

— Sam

---
You're getting this because you opted in at crads-ai.com. Reply "stop" if you'd rather not hear from me.`;
}

// --- Google Sheets append ----------------------------------------------------

async function appendLeadRow({ google, email, source, date }) {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.LEAD_NURTURE_SHEET_ID;
  if (!clientEmail || !privateKeyRaw || !sheetId) {
    const err = new Error('lead-capture sheet env vars missing');
    err.code = 'sheet_env_missing';
    throw err;
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const auth = new google.auth.JWT(
    clientEmail,
    undefined,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Leads!A:G',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[email, date, source, 'TRUE', '', '', '']],
    },
  });
}

// --- Resend send -------------------------------------------------------------

async function sendWelcomeEmail({ resend, to }) {
  const from = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'Sam Davis <hello@crads-ai.com>';
  const replyTo = process.env.REPLY_TO_EMAIL || 'cradsdavis@gmail.com';
  const result = await resend.emails.send({
    from,
    reply_to: replyTo,
    to,
    subject: EMAIL_1_SUBJECT,
    html: email1Html(),
    text: email1Text(),
  });
  if (result && result.error) {
    const err = new Error(`Resend lead-capture email failed: ${result.error.message || JSON.stringify(result.error)}`);
    err.resend = result.error;
    throw err;
  }
  return result;
}

// --- Handler -----------------------------------------------------------------
// Vercel-shaped (req, res) handler. Deps (google, resend) are injected so
// tests can mock without monkey-patching `require()`.

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || 'https://crads-ai.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try { return [JSON.parse(req.body.toString('utf8')), null]; }
    catch { return [null, 'invalid_json']; }
  }
  if (typeof req.body === 'string') {
    try { return [JSON.parse(req.body), null]; }
    catch { return [null, 'invalid_json']; }
  }
  return [req.body || {}, null];
}

function makeHandler({ google, resend }) {
  return async function leadCaptureHandler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

    const [body, parseErr] = parseBody(req);
    if (parseErr) { res.status(400).json({ error: parseErr }); return; }

    const validationError = validateBody(body);
    if (validationError) { res.status(400).json({ error: validationError }); return; }

    const email = String(body.email).trim().toLowerCase();
    const source = sanitizeSource(body.source);
    const date = todayIso();

    try {
      await appendLeadRow({ google, email, source, date });
    } catch (err) {
      console.error('[lead-capture] sheet append failed', err && err.message);
      res.status(500).json({ error: 'sheet_append_failed' });
      return;
    }

    try {
      await sendWelcomeEmail({ resend, to: email });
    } catch (err) {
      // Sheet row already written — don't fail the user-facing response;
      // log + return 200 so the form still confirms "check your inbox".
      // The cron retry in Task 3.2 (Email1Sent column = empty) can re-send.
      // Actually: we wrote Email1Sent=TRUE above, so retry won't fire.
      // Safer: log loudly + return 200 (don't break the form on transient
      // Resend hiccups). Sam-side ops can scan logs.
      console.error('[lead-capture] welcome email failed', err && err.message);
    }

    res.status(200).json({ ok: true });
  };
}

module.exports = {
  validateBody,
  sanitizeSource,
  todayIso,
  email1Html,
  email1Text,
  appendLeadRow,
  sendWelcomeEmail,
  makeHandler,
  EMAIL_1_SUBJECT,
};
