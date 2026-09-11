// tests/availability.test.js - /api/cal/availability serves the right Cal
// event type per SKU and, since v5 (2026-09-11), per session: the portal's
// session-2 picker must never load session 1's slots (30 vs 60 minutes on the
// walkthrough, 120 vs 60 on the guided setup).
'use strict';
const test = require('node:test');
const assert = require('node:assert');

process.env.BASE_URL = 'https://crads-ai.com';
process.env.CAL_EVENT_TYPE_DISCOVERY = '100';
delete process.env.CAL_EVENT_TYPE_WALKTHROUGH_S1; delete process.env.CAL_EVENT_TYPE_WALKTHROUGH_S2;
delete process.env.CAL_EVENT_TYPE_GUIDED_SETUP_S1; delete process.env.CAL_EVENT_TYPE_GUIDED_SETUP_S2;
delete process.env.CAL_EVENT_TYPE_WORKING_SESSION;

const CAL_CALLS = [];
require.cache[require.resolve('../lib/cal')] = {
  exports: { getAvailableSlots: async (args) => { CAL_CALLS.push(args); return { ok: true, status: 200, body: { data: { slots: { '2026-10-01': [] } } } }; } },
};
delete require.cache[require.resolve('../lib/skus')];
const handler = require('../api/cal/availability');

function run(query) {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 8 * 86400000).toISOString();
  return handler({ method: 'GET', query: { startDate: start, endDate: end, ...query } }, res).then(() => res);
}

test('no session param means session 1 (the public /book pages)', async () => {
  CAL_CALLS.length = 0;
  const res = await run({ sku: 'walkthrough' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(CAL_CALLS[0].eventTypeId, 7030765);
});

test('session=2 serves the second session\'s type for both v5 SKUs', async () => {
  CAL_CALLS.length = 0;
  await run({ sku: 'walkthrough', session: '2' });
  await run({ sku: 'guided-setup', session: '2' });
  assert.deepStrictEqual(CAL_CALLS.map((c) => c.eventTypeId), [7030766, 7030768]);
});

test('a session past the SKU\'s last, or a non-number, is 400 invalid_session; an unknown slug is 400 unknown_sku', async () => {
  assert.strictEqual((await run({ sku: 'walkthrough', session: '3' })).body.error, 'invalid_session');
  assert.strictEqual((await run({ sku: 'walkthrough', session: 'x' })).body.error, 'invalid_session');
  assert.strictEqual((await run({ sku: 'nope' })).body.error, 'unknown_sku');
});

test('the retired working session has no default type: 400 rather than a silent wrong calendar', async () => {
  assert.strictEqual((await run({ sku: 'working-session' })).body.error, 'unknown_sku');
});

test('discovery ignores the session param and uses its own env type', async () => {
  CAL_CALLS.length = 0;
  const res = await run({ sku: 'discovery', session: '2' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(CAL_CALLS[0].eventTypeId, 100);
});
