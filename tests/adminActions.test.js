'use strict';
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-here';
process.env.RESEND_API_KEY = 're_test_dummy';
process.env.RESEND_FROM_EMAIL = 'Sam <hello@crads-ai.com>';
process.env.BASE_URL = 'https://crads-ai.com';
const test = require('node:test');
const assert = require('node:assert');

test('advance-state handler loads', async () => {
  const handler = require('../api/admin/advance-state');
  assert.strictEqual(typeof handler, 'function');
});

test('notes handler loads', async () => {
  const handler = require('../api/admin/notes');
  assert.strictEqual(typeof handler, 'function');
});

test('resend-link handler loads', async () => {
  const handler = require('../api/admin/resend-link');
  assert.strictEqual(typeof handler, 'function');
});

test('create-user handler loads', async () => {
  const handler = require('../api/admin/create-user');
  assert.strictEqual(typeof handler, 'function');
});

// Note: for richer admin endpoint tests, refactor into lib/adminAdvanceState.js
// (DI-friendly) per the pattern of lib/leadCapture.js. For MVP plan, accept
// surface-level loading test + manual smoke test.
