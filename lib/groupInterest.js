// lib/groupInterest.js — Group Block interest-capture logic
// Per coaching co-primary spec § 4.7. Lower-traffic surface than lead-capture
// (only fires when activeCohort flips to null). Writes Group Interest tab
// in the Lead Nurture sheet + notifies Sam by email.
//
// Two consumers:
//   1. api/group-interest.js (Vercel serverless function — thin adapter)
//   2. tests/groupInterest.test.js (node:test with mocked Resend + googleapis)
'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'invalid_body';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) return 'invalid_email';
  return null;
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

// --- Notification email (to Sam) --------------------------------------------

function notificationSubject(email) {
  return `Group Block interest — ${email}`;
}

function notificationHtml({ email, date, sheetId }) {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;line-height:1.55;">
  <p>New Group Block interest sign-up.</p>
  <ul>
    <li><strong>Email:</strong> ${email}</li>
    <li><strong>Submitted:</strong> ${date}</li>
  </ul>
  <p><a href="${sheetUrl}">Open Lead Nurture sheet → Group Interest tab</a></p>
  <p>When the next cohort opens, notify them and mark the row.</p>
</body></html>`;
}

function notificationText({ email, date, sheetId }) {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
  return `New Group Block interest sign-up.

Email: ${email}
Submitted: ${date}

Open Lead Nurture sheet (Group Interest tab):
${sheetUrl}

When the next cohort opens, notify them and mark the row.`;
}

// --- Google Sheets append ----------------------------------------------------

async function appendInterestRow({ google, email, date }) {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.LEAD_NURTURE_SHEET_ID;
  if (!clientEmail || !privateKeyRaw || !sheetId) {
    const err = new Error('group-interest sheet env vars missing');
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
    range: "'Group Interest'!A:C",
    valueInputOption: 'RAW',
    requestBody: {
      values: [[email, date, 'FALSE']],
    },
  });
}

// --- Resend send (notify Sam) -----------------------------------------------

async function sendNotificationEmail({ resend, email, date }) {
  const sheetId = process.env.LEAD_NURTURE_SHEET_ID;
  const from = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'Sam Davis <hello@crads-ai.com>';
  const to = process.env.GROUP_INTEREST_NOTIFY_EMAIL || 'cradsdavis@gmail.com';
  const replyTo = process.env.REPLY_TO_EMAIL || 'cradsdavis@gmail.com';
  const result = await resend.emails.send({
    from,
    reply_to: replyTo,
    to,
    subject: notificationSubject(email),
    html: notificationHtml({ email, date, sheetId }),
    text: notificationText({ email, date, sheetId }),
  });
  if (result && result.error) {
    const err = new Error(`Resend group-interest notification failed: ${result.error.message || JSON.stringify(result.error)}`);
    err.resend = result.error;
    throw err;
  }
  return result;
}

// --- Handler -----------------------------------------------------------------

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
  return async function groupInterestHandler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

    const [body, parseErr] = parseBody(req);
    if (parseErr) { res.status(400).json({ error: parseErr }); return; }

    const validationError = validateBody(body);
    if (validationError) { res.status(400).json({ error: validationError }); return; }

    const email = String(body.email).trim().toLowerCase();
    const date = todayIso();

    // Both capture paths are best-effort. The email notification is the primary
    // capture (works with just RESEND set); the sheet row is a bonus that starts
    // working once the Google service-account env vars are provisioned. Only fail
    // the request if BOTH fail — otherwise the sign-up is captured somewhere.
    let sheetOk = false;
    let emailOk = false;

    try {
      await appendInterestRow({ google, email, date });
      sheetOk = true;
    } catch (err) {
      console.error('[group-interest] sheet append failed', err && err.message);
    }

    try {
      await sendNotificationEmail({ resend, email, date });
      emailOk = true;
    } catch (err) {
      console.error('[group-interest] notification email failed', err && err.message);
    }

    if (!sheetOk && !emailOk) {
      res.status(500).json({ error: 'capture_failed' });
      return;
    }

    res.status(200).json({ ok: true });
  };
}

module.exports = {
  validateBody,
  todayIso,
  notificationSubject,
  notificationHtml,
  notificationText,
  appendInterestRow,
  sendNotificationEmail,
  makeHandler,
};
