// tests/skusDefaults.test.js - the v4 SKUs resolve their Cal event types with
// no env at all (hard-coded IDs, 2026-09-09), env overrides win, and the
// legacy SKUs still fail loudly without their env.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

function fresh() {
  delete require.cache[require.resolve('../lib/skus')];
  return require('../lib/skus');
}

test('v4 SKUs resolve Cal event types without env', () => {
  for (const k of ['CAL_EVENT_TYPE_GUIDED_SETUP', 'CAL_EVENT_TYPE_WORKING_SESSION', 'CAL_EVENT_TYPE_SINGLE']) delete process.env[k];
  const { getSku, calEventTypeIdFor } = fresh();
  assert.strictEqual(getSku('guided-setup').cal_event_type_id, 6999123);
  assert.strictEqual(getSku('working-session').cal_event_type_id, 6999124);
  assert.strictEqual(calEventTypeIdFor('working-session'), 6999124);
  assert.strictEqual(getSku('guided-setup').duration_min, 60);
  assert.strictEqual(getSku('working-session').duration_min, 90);
});

test('env overrides the hard-coded id; legacy SKUs have no default', () => {
  process.env.CAL_EVENT_TYPE_WORKING_SESSION = '4242';
  delete process.env.CAL_EVENT_TYPE_SINGLE;
  const { getSku, calEventTypeIdFor } = fresh();
  assert.strictEqual(getSku('working-session').cal_event_type_id, 4242);
  assert.throws(() => calEventTypeIdFor('single-session'), /Missing env var: CAL_EVENT_TYPE_SINGLE/);
  delete process.env.CAL_EVENT_TYPE_WORKING_SESSION;
});
