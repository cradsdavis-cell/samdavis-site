'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Test env
process.env.GOOGLE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n';
process.env.LEAD_NURTURE_SHEET_ID = 'sheet_test_id';
process.env.RESEND_FROM_EMAIL = 'Sam <hello@crads-ai.com>';
process.env.REPLY_TO_EMAIL = 'cradsdavis@gmail.com';
process.env.CRON_SECRET = 'test-secret-abc';

const {
  makeHandler,
  pickPendingEmail,
  daysSince,
  isTruthy,
} = require('../lib/nurtureCron');
const { nurtureEmails } = require('../lib/nurtureEmails');

// --- Mocks -------------------------------------------------------------------

function makeMockGoogle({ rows = [], throwOnGet, throwOnUpdate } = {}) {
  const getCalls = [];
  const updateCalls = [];
  const google = {
    auth: {
      JWT: function (email, _x, key, scopes) {
        this.email = email; this.key = key; this.scopes = scopes;
      },
    },
    sheets: () => ({
      spreadsheets: {
        values: {
          get: async (args) => {
            getCalls.push(args);
            if (throwOnGet) throw new Error('sheet get boom');
            return { data: { values: rows } };
          },
          update: async (args) => {
            updateCalls.push(args);
            if (throwOnUpdate) throw new Error('sheet update boom');
            return { data: { updatedRows: 1 } };
          },
        },
      },
    }),
  };
  return { google, getCalls, updateCalls };
}

function makeMockResend({ throwOnSend, returnError } = {}) {
  const sends = [];
  return {
    sends,
    resend: {
      emails: {
        send: async (args) => {
          sends.push(args);
          if (throwOnSend) throw new Error('resend boom');
          if (returnError) return { error: { message: 'API failure' } };
          return { id: 'em_test_123' };
        },
      },
    },
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function mockReq({ auth } = {}) {
  const headers = {};
  if (auth !== undefined) headers.authorization = auth;
  return { method: 'POST', headers };
}

// Build a row for the sheet: [email, signupDate, source, e1, e2, e3, e4]
function row(email, signupDate, { e1 = 'TRUE', e2 = '', e3 = '', e4 = '' } = {}) {
  return [email, signupDate, '/about', e1, e2, e3, e4];
}

// Helper: compute an ISO date N days before "today" reference.
function isoNDaysAgo(today, n) {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0];
}

const TODAY = '2026-06-02T00:00:00.000Z';

// --- Unit: isTruthy ----------------------------------------------------------

test('isTruthy recognises TRUE/true/yes/1', () => {
  assert.strictEqual(isTruthy('TRUE'), true);
  assert.strictEqual(isTruthy('true'), true);
  assert.strictEqual(isTruthy('YES'), true);
  assert.strictEqual(isTruthy('1'), true);
  assert.strictEqual(isTruthy(''), false);
  assert.strictEqual(isTruthy(undefined), false);
  assert.strictEqual(isTruthy(null), false);
  assert.strictEqual(isTruthy('FALSE'), false);
});

// --- Unit: daysSince ---------------------------------------------------------

test('daysSince computes whole days between dates', () => {
  const today = new Date('2026-06-02T00:00:00.000Z');
  assert.strictEqual(daysSince('2026-05-30', today), 3);
  assert.strictEqual(daysSince('2026-06-02', today), 0);
  assert.strictEqual(daysSince('2026-05-19', today), 14);
});

test('daysSince returns -1 for invalid date string', () => {
  const today = new Date('2026-06-02');
  assert.strictEqual(daysSince('not-a-date', today), -1);
});

// --- Unit: pickPendingEmail --------------------------------------------------

test('pickPendingEmail picks email4 at day 14 even if email2+3 pending', () => {
  const pick = pickPendingEmail({ days: 14, e2: false, e3: false, e4: false });
  assert.deepStrictEqual(pick, { key: 'email4', col: 'G' });
});

test('pickPendingEmail picks email3 at day 7 if e3 pending and e4 not yet eligible', () => {
  const pick = pickPendingEmail({ days: 7, e2: true, e3: false, e4: false });
  assert.deepStrictEqual(pick, { key: 'email3', col: 'F' });
});

test('pickPendingEmail picks email2 at day 3', () => {
  const pick = pickPendingEmail({ days: 3, e2: false, e3: false, e4: false });
  assert.deepStrictEqual(pick, { key: 'email2', col: 'E' });
});

test('pickPendingEmail returns null at day 2', () => {
  assert.strictEqual(pickPendingEmail({ days: 2, e2: false, e3: false, e4: false }), null);
});

test('pickPendingEmail returns null if all sent', () => {
  assert.strictEqual(pickPendingEmail({ days: 20, e2: true, e3: true, e4: true }), null);
});

// --- Auth --------------------------------------------------------------------

test('cron with missing auth header returns 401', async () => {
  const { google } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({}), res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, 'unauthorized');
});

test('cron with wrong auth secret returns 401', async () => {
  const { google } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer wrong-secret' }), res);
  assert.strictEqual(res.statusCode, 401);
});

test('cron with correct auth proceeds', async () => {
  const { google } = makeMockGoogle({ rows: [] });
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);
  assert.strictEqual(res.statusCode, 200);
});

// --- Integration: empty sheet ------------------------------------------------

test('empty sheet returns { sent: 0, total: 0 }', async () => {
  const { google, getCalls } = makeMockGoogle({ rows: [] });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { sent: 0, failed: 0, total: 0 });
  assert.strictEqual(getCalls.length, 1);
  assert.strictEqual(getCalls[0].range, 'Leads!A2:G1000');
  assert.strictEqual(sends.length, 0);
});

// --- Integration: day-3 row sends email2 ------------------------------------

test('row at day 3 with email2 empty sends email 2 and marks E TRUE', async () => {
  const day3 = isoNDaysAgo(TODAY, 3);
  const rows = [row('alex@example.com', day3)];
  const { google, updateCalls } = makeMockGoogle({ rows });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.sent, 1);
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].to, 'alex@example.com');
  assert.strictEqual(sends[0].subject, nurtureEmails.email2.subject);
  assert.strictEqual(updateCalls.length, 1);
  assert.strictEqual(updateCalls[0].range, 'Leads!E2');
  assert.deepStrictEqual(updateCalls[0].requestBody.values, [['TRUE']]);
});

// --- Integration: day-14 row sends email4 (skips 2+3 even if empty) ---------

test('row at day 14 with all of email2/3/4 empty sends only email 4 (one per run)', async () => {
  const day14 = isoNDaysAgo(TODAY, 14);
  const rows = [row('beth@example.com', day14)];
  const { google, updateCalls } = makeMockGoogle({ rows });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);

  assert.strictEqual(res.body.sent, 1);
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].subject, nurtureEmails.email4.subject);
  assert.strictEqual(updateCalls.length, 1);
  assert.strictEqual(updateCalls[0].range, 'Leads!G2');
});

// --- Integration: day-2 row sends nothing -----------------------------------

test('row at day 2 sends no email', async () => {
  const day2 = isoNDaysAgo(TODAY, 2);
  const rows = [row('carl@example.com', day2)];
  const { google, updateCalls } = makeMockGoogle({ rows });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);

  assert.strictEqual(res.body.sent, 0);
  assert.strictEqual(sends.length, 0);
  assert.strictEqual(updateCalls.length, 0);
});

// --- Integration: day-7 row with email2 already TRUE sends email3 -----------

test('row at day 7 with email2 already TRUE sends email 3 and marks F TRUE', async () => {
  const day7 = isoNDaysAgo(TODAY, 7);
  const rows = [row('dana@example.com', day7, { e2: 'TRUE' })];
  const { google, updateCalls } = makeMockGoogle({ rows });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);

  assert.strictEqual(res.body.sent, 1);
  assert.strictEqual(sends[0].subject, nurtureEmails.email3.subject);
  assert.strictEqual(updateCalls[0].range, 'Leads!F2');
});

// --- Integration: fully-sent row (all TRUE) skipped -------------------------

test('row with email4 already TRUE sends nothing (sequence complete)', async () => {
  const day30 = isoNDaysAgo(TODAY, 30);
  const rows = [row('eve@example.com', day30, { e2: 'TRUE', e3: 'TRUE', e4: 'TRUE' })];
  const { google, updateCalls } = makeMockGoogle({ rows });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);

  assert.strictEqual(res.body.sent, 0);
  assert.strictEqual(sends.length, 0);
  assert.strictEqual(updateCalls.length, 0);
});

// --- Integration: mixed batch (3 rows, 3 different states) ------------------

test('mixed batch sends one email per eligible row', async () => {
  const rows = [
    row('alex@example.com', isoNDaysAgo(TODAY, 3)),                              // → email2
    row('beth@example.com', isoNDaysAgo(TODAY, 7), { e2: 'TRUE' }),              // → email3
    row('carl@example.com', isoNDaysAgo(TODAY, 14), { e2: 'TRUE', e3: 'TRUE' }), // → email4
    row('dana@example.com', isoNDaysAgo(TODAY, 1)),                              // → none (day 1)
  ];
  const { google, updateCalls } = makeMockGoogle({ rows });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);

  assert.strictEqual(res.body.sent, 3);
  assert.strictEqual(res.body.total, 4);
  assert.strictEqual(sends.length, 3);
  assert.strictEqual(updateCalls.length, 3);
  // Sheet rows are i + 2 → rows 2, 3, 4 (row 5 not touched).
  assert.deepStrictEqual(
    updateCalls.map((u) => u.range).sort(),
    ['Leads!E2', 'Leads!F3', 'Leads!G4']
  );
});

// --- Integration: row missing email or signupDate skipped -------------------

test('row missing email is skipped', async () => {
  const rows = [
    ['', isoNDaysAgo(TODAY, 5), '/about', 'TRUE', '', '', ''],
    row('valid@example.com', isoNDaysAgo(TODAY, 3)),
  ];
  const { google } = makeMockGoogle({ rows });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);

  assert.strictEqual(res.body.sent, 1);
  assert.strictEqual(sends[0].to, 'valid@example.com');
});

// --- Failure: Resend throws → row not marked, failed counted ----------------

test('Resend failure for one row does not mark column and counts as failed', async () => {
  const rows = [row('alex@example.com', isoNDaysAgo(TODAY, 3))];
  const { google, updateCalls } = makeMockGoogle({ rows });
  const { resend } = makeMockResend({ throwOnSend: true });
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  const origErr = console.error; console.error = () => {};
  try {
    await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);
  } finally {
    console.error = origErr;
  }
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.sent, 0);
  assert.strictEqual(res.body.failed, 1);
  assert.strictEqual(updateCalls.length, 0); // row NOT marked → retry next run
});

// --- Failure: sheet read throws → 500 ---------------------------------------

test('sheet read failure returns 500', async () => {
  const { google } = makeMockGoogle({ throwOnGet: true });
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend, now: TODAY });
  const res = mockRes();
  const origErr = console.error; console.error = () => {};
  try {
    await handler(mockReq({ auth: 'Bearer test-secret-abc' }), res);
  } finally {
    console.error = origErr;
  }
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.error, 'sheet_read_failed');
});
