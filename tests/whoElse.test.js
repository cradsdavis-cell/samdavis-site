'use strict';
// "Who else could do this with you?" on /thanks after a guided setup
// (2026-10-21): api/who-else.js checks the checkout with Stripe and emails Sam.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let sessionStub = null;
const ALERTS = [];
let alertFails = false;
let count = 0;
require.cache[require.resolve('../lib/stripe')] = {
  exports: {
    retrieveCheckoutSession: async (id) => {
      if (!sessionStub) { const e = new Error('No such checkout.session'); e.type = 'StripeInvalidRequestError'; throw e; }
      return { id, ...sessionStub };
    },
  },
};
require.cache[require.resolve('../lib/email')] = {
  exports: { sendSamAlert: async (a) => { if (alertFails) throw new Error('resend down'); ALERTS.push(a); } },
};
require.cache[require.resolve('../lib/kv')] = {
  exports: { defaultKv: () => ({ countWhoElse: async () => ++count }) },
};
const handler = require('../api/who-else');

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}
const SID = 'cs_test_abc123';
const paidGs = () => ({ status: 'complete', payment_status: 'paid', metadata: { sku: 'guided-setup', name: 'Bea Buyer' }, customer_details: { email: 'bea@example.com' } });
async function post(body) {
  const res = mockRes();
  await handler({ method: 'POST', body }, res);
  return res;
}
function reset() { ALERTS.length = 0; alertFails = false; count = 0; sessionStub = paidGs(); }

test('who-else: a paid guided setup sends Sam the name and email for a three-way intro', async () => {
  reset();
  const res = await post({ session_id: SID, name: '  Rae   Friend ', email: 'Rae@Example.com' });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true });
  assert.strictEqual(ALERTS.length, 1);
  assert.match(ALERTS[0].subject, /who else: Bea Buyer named Rae Friend/);
  assert.match(ALERTS[0].body, /Bea Buyer \(bea@example\.com\)/);
  assert.match(ALERTS[0].body, /Rae Friend <rae@example\.com>/);
  assert.match(ALERTS[0].body, /three-way intro/);
  assert.ok(!ALERTS[0].body.includes('—'), 'no em dashes');
});

test('who-else: the email is optional; a name is not', async () => {
  reset();
  let res = await post({ session_id: SID, name: 'Rae' });
  assert.strictEqual(res.statusCode, 200);
  assert.match(ALERTS[0].body, /Rae \(no email given\)/);
  res = await post({ session_id: SID, name: '   ', email: 'rae@example.com' });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'missing_name');
  res = await post({ session_id: SID, name: 'Rae', email: 'not-an-email' });
  assert.strictEqual(res.body.error, 'invalid_email');
});

test('who-else: links are stripped from the name (it lands in an email)', async () => {
  reset();
  await post({ session_id: SID, name: 'Rae https://evil.example/x' });
  assert.ok(!ALERTS[0].body.includes('evil.example'));
});

test('who-else: only a completed guided setup checkout can send', async () => {
  reset();
  for (const stub of [
    { ...paidGs(), metadata: { sku: 'roadmap' } },
    { ...paidGs(), status: 'open' },
    { ...paidGs(), metadata: {} },
  ]) {
    sessionStub = stub;
    const res = await post({ session_id: SID, name: 'Rae' });
    assert.strictEqual(res.statusCode, 403);
  }
  sessionStub = null;
  assert.strictEqual((await post({ session_id: SID, name: 'Rae' })).statusCode, 400);
  sessionStub = paidGs();
  for (const bad of ['', 'cs_live_', 'pi_123', '../x']) {
    assert.strictEqual((await post({ session_id: bad, name: 'Rae' })).body.error, 'bad_session_id');
  }
  assert.strictEqual(ALERTS.length, 0);
});

test('who-else: at most five per checkout session', async () => {
  reset();
  for (let i = 0; i < 5; i++) assert.strictEqual((await post({ session_id: SID, name: `P${i}` })).statusCode, 200);
  assert.strictEqual((await post({ session_id: SID, name: 'P6' })).statusCode, 429);
  assert.strictEqual(ALERTS.length, 5);
});

test('who-else: a failed send says so (the page then offers the email address)', async () => {
  reset();
  alertFails = true;
  const res = await post({ session_id: SID, name: 'Rae' });
  assert.strictEqual(res.statusCode, 502);
});

test('who-else: GET is refused; bad JSON is a 400', async () => {
  reset();
  const res = mockRes();
  await handler({ method: 'GET' }, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual((await post('{nope')).statusCode, 400);
});

test('/thanks carries the "Who else" block, hidden until a guided setup is confirmed', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'thanks.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'thanks.js'), 'utf8');
  assert.match(html, /<div id="who-else" class="book-policy" hidden>/);
  assert.match(html, /Who else could do this with you\?/);
  assert.match(js, /params\.get\('sku'\) !== 'guided-setup'/);
  assert.match(js, /\/api\/who-else/);
  const block = html.slice(html.indexOf('<div id="who-else"'), html.indexOf('<div id="invoice"'));
  const fn = js.slice(js.indexOf('function showWhoElse'), js.indexOf('let attempts'));
  assert.ok(block.length && fn.length, 'block and handler found');
  assert.ok(!block.includes('—') && !fn.includes('—'), 'no em dashes');
});
