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

const { makeHandler, validateBody, sanitizeSource } = require('../lib/leadCapture');

// --- Mocks -------------------------------------------------------------------

function makeMockGoogle({ onAppend, throwOnAppend } = {}) {
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
            if (onAppend) onAppend(args);
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

function mockReq(body, method = 'POST') {
  return { method, body };
}
function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

// --- validateBody unit tests -------------------------------------------------

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

test('sanitizeSource strips control chars and caps length', () => {
  assert.strictEqual(sanitizeSource('/about'), '/about');
  assert.strictEqual(sanitizeSource(''), 'unknown');
  assert.strictEqual(sanitizeSource(null), 'unknown');
  const long = '/x'.repeat(200);
  assert.ok(sanitizeSource(long).length <= 80);
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

test('POST with missing email returns 400', async () => {
  const { google } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({}), res);
  assert.strictEqual(res.statusCode, 400);
});

test('POST with valid email writes sheet row and sends email, returns 200', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ email: 'alex@example.com', source: '/about' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.ok, true);

  // Sheet append called once with the expected shape
  assert.strictEqual(calls.length, 1);
  const appendArgs = calls[0];
  assert.strictEqual(appendArgs.spreadsheetId, 'sheet_test_id');
  assert.strictEqual(appendArgs.range, 'Leads!A:G');
  assert.strictEqual(appendArgs.valueInputOption, 'RAW');
  const row = appendArgs.requestBody.values[0];
  assert.strictEqual(row[0], 'alex@example.com');
  // row[1] = today (ISO date) — just verify format
  assert.match(row[1], /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(row[2], '/about');
  assert.strictEqual(row[3], 'TRUE');

  // Resend send called once with welcome email
  assert.strictEqual(sends.length, 1);
  const sendArgs = sends[0];
  assert.strictEqual(sendArgs.to, 'alex@example.com');
  assert.match(sendArgs.subject, /Thanks/);
  assert.ok(sendArgs.html);
  assert.ok(sendArgs.text);
  assert.match(sendArgs.from, /crads-ai\.com/);
});

test('POST normalises email to lowercase + trims whitespace', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ email: '  Alex@Example.COM  ', source: '/about' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls[0].requestBody.values[0][0], 'alex@example.com');
  assert.strictEqual(sends[0].to, 'alex@example.com');
});

test('POST defaults source to "unknown" when missing', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ email: 'alex@example.com' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls[0].requestBody.values[0][2], 'unknown');
});

test('POST returns 500 if Sheet append fails (email NOT sent)', async () => {
  const { google } = makeMockGoogle({ throwOnAppend: true });
  const { resend, sends } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  await handler(mockReq({ email: 'alex@example.com' }), res);
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.error, 'sheet_append_failed');
  assert.strictEqual(sends.length, 0, 'should not send email if sheet write fails');
});

test('POST still returns 200 if Resend fails (sheet row already saved)', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend } = makeMockResend({ throwOnSend: true });
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  // Suppress expected console.error during this test
  const origErr = console.error; console.error = () => {};
  try {
    await handler(mockReq({ email: 'alex@example.com' }), res);
  } finally {
    console.error = origErr;
  }
  // Sheet row still written; user-facing form still confirms.
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls.length, 1);
});

test('POST handles Buffer body (Vercel raw mode)', async () => {
  const { google, calls } = makeMockGoogle();
  const { resend } = makeMockResend();
  const handler = makeHandler({ google, resend });
  const res = mockRes();
  const body = Buffer.from(JSON.stringify({ email: 'alex@example.com', source: '/x' }));
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
