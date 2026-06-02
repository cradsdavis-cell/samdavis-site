// lib/nurtureCron.js — Daily nurture-email cron logic
// Per coaching co-primary spec § 5.3 + Task 3.2.
//
// Two consumers:
//   1. api/cron/nurture.js (Vercel serverless function — thin adapter,
//      invoked daily by Vercel Cron per vercel.json crons schedule)
//   2. tests/nurture.test.js (node:test with mocked Resend + googleapis)
//
// Behaviour:
//   - Auth via Authorization: Bearer ${CRON_SECRET} header (401 otherwise).
//   - Read Leads!A2:G1000 from Lead Nurture sheet.
//   - For each row: compute days-since-signup, send the LATEST-eligible
//     pending email (one email per row per run — priority order 4 > 3 > 2),
//     then write TRUE back to the corresponding column.
//   - Return { sent, total } JSON.
'use strict';

const { nurtureEmails } = require('./nurtureEmails');

const SHEET_RANGE = 'Leads!A2:G1000';
const DAY_MS = 86400000;

function isTruthy(cell) {
  if (cell === undefined || cell === null) return false;
  const s = String(cell).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

function daysSince(signupDateStr, today) {
  const signup = new Date(signupDateStr);
  if (isNaN(signup.getTime())) return -1;
  // Floor at midnight UTC to avoid sub-day drift between runs.
  return Math.floor((today.getTime() - signup.getTime()) / DAY_MS);
}

// Returns { key, col } for the latest-eligible pending email, or null.
// Priority order: email 4 (≥14d) > email 3 (≥7d) > email 2 (≥3d).
// One email per row per run; cron sweeps daily so the next eligible
// email fires on the next run.
function pickPendingEmail({ days, e2, e3, e4 }) {
  if (days >= 14 && !e4) return { key: 'email4', col: 'G' };
  if (days >= 7 && !e3) return { key: 'email3', col: 'F' };
  if (days >= 3 && !e2) return { key: 'email2', col: 'E' };
  return null;
}

function getSheetsClient({ google }) {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.LEAD_NURTURE_SHEET_ID;
  if (!clientEmail || !privateKeyRaw || !sheetId) {
    const err = new Error('nurture-cron sheet env vars missing');
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
  return { sheets: google.sheets({ version: 'v4', auth }), sheetId };
}

async function sendNurtureEmail({ resend, to, emailKey }) {
  const tmpl = nurtureEmails[emailKey];
  if (!tmpl) throw new Error(`unknown nurture template: ${emailKey}`);
  const from = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'Sam Davis <hello@crads-ai.com>';
  const replyTo = process.env.REPLY_TO_EMAIL || 'cradsdavis@gmail.com';
  const result = await resend.emails.send({
    from,
    reply_to: replyTo,
    to,
    subject: tmpl.subject,
    html: tmpl.html,
  });
  if (result && result.error) {
    const err = new Error(`Resend nurture-${emailKey} failed: ${result.error.message || JSON.stringify(result.error)}`);
    err.resend = result.error;
    throw err;
  }
  return result;
}

function makeHandler({ google, resend, now } = {}) {
  return async function nurtureCronHandler(req, res) {
    // 1. Auth — Vercel Cron sets Authorization: Bearer ${CRON_SECRET}.
    const expected = process.env.CRON_SECRET;
    const got = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (!expected || got !== `Bearer ${expected}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    // 2. Sheet read.
    let sheets, sheetId, rows;
    try {
      ({ sheets, sheetId } = getSheetsClient({ google }));
      const data = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: SHEET_RANGE,
      });
      rows = (data && data.data && data.data.values) || [];
    } catch (err) {
      console.error('[nurture-cron] sheet read failed', err && err.message);
      res.status(500).json({ error: 'sheet_read_failed' });
      return;
    }

    const today = now ? new Date(now) : new Date();
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = row[0];
      const signupDate = row[1];
      const e2 = isTruthy(row[4]);
      const e3 = isTruthy(row[5]);
      const e4 = isTruthy(row[6]);
      if (!email || !signupDate) continue;

      const days = daysSince(signupDate, today);
      if (days < 0) continue;

      const pick = pickPendingEmail({ days, e2, e3, e4 });
      if (!pick) continue;

      try {
        await sendNurtureEmail({ resend, to: email, emailKey: pick.key });
      } catch (err) {
        console.error(`[nurture-cron] send failed for ${email} (${pick.key})`, err && err.message);
        failed++;
        continue; // skip sheet update; next run will retry.
      }

      try {
        // Sheet row in spreadsheet = i + 2 (range starts at row 2).
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `Leads!${pick.col}${i + 2}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['TRUE']] },
        });
        sent++;
      } catch (err) {
        console.error(`[nurture-cron] sheet update failed for ${email} (${pick.key})`, err && err.message);
        failed++;
        // Email went out but we couldn't mark it. Next run may double-send.
        // Surface in count but don't fail the cron — log loudly.
      }
    }

    res.status(200).json({ sent, failed, total: rows.length });
  };
}

module.exports = {
  makeHandler,
  pickPendingEmail,
  daysSince,
  isTruthy,
  sendNurtureEmail,
  SHEET_RANGE,
};
