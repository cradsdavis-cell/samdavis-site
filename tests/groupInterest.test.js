'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Test env
process.env.BASE_URL = 'https://crads-ai.com';
process.env.GOOGLE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n';
process.env.LEAD_NURTURE_SHEET_ID = 'sheet_test_id';
process.env.RESEND_FROM_EMAIL = 'Sam <hello@crads-ai.com>';
process.env.REPLY_TO_EMAIL = 'cradsdavis@gmail.com';
process.env.GROUP_INTEREST_NOTIFY_EMAIL = 'cradsdavis@gmail.com';

const { makeHandler, validateBody, notificationSubject, notificationHtml, notificationText } = require('../lib/groupInterest');

// --- Mocks -------------------------------------------------------------------

function makeMockGoogle({ throwOnAppend } = {}) {
  const calls = [];
  const google = {
    auth: {
      JWT: function (email, _x, key, scopes) {
        this.email = email; this.key = key; this.scopes = scopes;
      },
    },
    sheets: () => ({
      spreadsheets: {
        values: {
          append: async (args) => {
            calls.push(args);
            if (throwOnAppend) throw new Error('sheet boom');
            return { data: { updates: { updatedRows: 1 } } };
          },
        },
      },
    }),
  };
  return { google, calls };
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

function mockReq(body, method = 'POST') { return { method, body }; }
function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

// --- Unit tests --------------------------------------------------------------

test('validateBody rejects missing email', () => {
  assert.strictEqual(validateBody({}), 'invalid_email');
});

test('validateBody rejects malformed email', () => {
  assert.strictEqual(validateBody({ email: 'not-an-email' }), 'invalid_email');
});

test('validateBody rejects oversized email', () => {
  const big = 'a'.repeat(250) + '@example.com';
  assert.strictEqual(validateBody({ email: big }), 'invalid_email');
});

test('validateBody accepts valid email', () => {
  assert.strictEqual(validateBody({ email: 'alex@example.com' }), null);
});

test('notificationSubject embeds email', () => {
  assert.match(notificationSubject('alex@example.com'), /alex@example\.com/);
  assert.match(notificationSubject('alex@example.com'), /Group Block interest/);
});

test('notificationHtml + text include sheet link', () => {
  const ctx = { email: 'a@b.com', date: '2026-06-02', sheetId: 'sheet_test_id' };
  const html = notificationHtml(ctx);
  const text = notificationText(ctx);
  assert.match(html, /sheet_test_id/);
  assert.match(text, /sheet_test_id/);
  assert.match(html, /a@b\.com/);
  assert.match(text, /a@b\.com/);
});

// --- Handler integration tests ----------------------------------------------

test('OPTIONS preflight returns 204 with CORS headers', async () => {
  const { google } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler({ method: 'OPTIONS', body: {} }, res);
  assert.strictEqual(res.statusCode, 204);
  assert.ok(res.headers['access-control-allow-origin']);
  assert.ok(res.headers['access-control-allow-methods']);
});

test('GET returns 405 method_not_allowed', async () => {
  const { google } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler({ method: 'GET', body: {} }, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.body.error, 'method_not_allowed');
});

test('POST with invalid email returns 400', async () => {
  const { google } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ email: 'nope' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_email');
});

test('POST with valid email writes Group Interest row + notifies Sam, returns 200', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ email: 'alex@example.com' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.ok, true);

  // Sheet append
  assert.strictEqual(calls.length, 1);
  const appendArgs = calls[0];
  assert.strictEqual(appendArgs.spreadsheetId, 'sheet_test_id');
  assert.match(appendArgs.range, /Group Interest/);
  assert.strictEqual(appendArgs.valueInputOption, 'RAW');
  const row = appendArgs.requestBody.values[0];
  assert.strictEqual(row[0], 'alex@example.com');
  assert.match(row[1], /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(row[2], 'FALSE');

  // Notification email
  assert.strictEqual(sends.length, 1);
  const sendArgs = sends[0];
  assert.strictEqual(sendArgs.to, 'cradsdavis@gmail.com');
  assert.match(sendArgs.subject, /Group Block interest — alex@example\.com/);
  assert.ok(sendArgs.html);
  assert.ok(sendArgs.text);
});

test('POST normalises email to lowercase + trims whitespace', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ email: '  Alex@Example.COM  ' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls[0].requestBody.values[0][0], 'alex@example.com');
  assert.match(sends[0].subject, /alex@example\.com/);
});

test('POST still returns 200 if Sheet append fails — email notify is the primary capture', async () => {
  const { google } = makeMockGoogle({ throwOnAppend: true });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  const origErr = console.error; console.error = () => {};
  try {
    await handler(mockReq({ email: 'alex@example.com' }), res);
  } finally {
    console.error = origErr;
  }
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(sends.length, 1, 'email notify should still fire when the sheet is unavailable');
});

test('POST returns 500 only if BOTH sheet and email fail', async () => {
  const { google } = makeMockGoogle({ throwOnAppend: true });
  const { resend } = makeMockResend({ throwOnSend: true });
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  const origErr = console.error; console.error = () => {};
  try {
    await handler(mockReq({ email: 'alex@example.com' }), res);
  } finally {
    console.error = origErr;
  }
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.error, 'capture_failed');
});

test('POST still returns 200 if Resend fails (sheet row already saved)', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend } = makeMockResend({ throwOnSend: true });
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  const origErr = console.error; console.error = () => {};
  try {
    await handler(mockReq({ email: 'alex@example.com' }), res);
  } finally {
    console.error = origErr;
  }
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls.length, 1);
});

test('POST handles Buffer body (Vercel raw mode)', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  const body = Buffer.from(JSON.stringify({ email: 'alex@example.com' }));
  await handler({ method: 'POST', body }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls.length, 1);
});

test('POST handles malformed JSON string body → 400', async () => {
  const { google } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler({ method: 'POST', body: '{not valid json' }, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'invalid_json');
});
