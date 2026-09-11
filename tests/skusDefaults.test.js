// tests/skusDefaults.test.js - the v5 SKUs resolve their Cal event types with
// no env at all (hard-coded IDs, four types created 2026-09-11), env overrides
// win per session, and the legacy SKUs still fail loudly without their env.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const V5_ENV = ['CAL_EVENT_TYPE_WALKTHROUGH_S1', 'CAL_EVENT_TYPE_WALKTHROUGH_S2', 'CAL_EVENT_TYPE_GUIDED_SETUP_S1', 'CAL_EVENT_TYPE_GUIDED_SETUP_S2'];

function fresh() {
  delete require.cache[require.resolve('../lib/skus')];
  return require('../lib/skus');
}

test('v5 SKUs resolve every session\'s Cal event type without env', () => {
  for (const k of [...V5_ENV, 'CAL_EVENT_TYPE_WORKING_SESSION', 'CAL_EVENT_TYPE_SINGLE']) delete process.env[k];
  const { getSku, calEventTypeIdFor } = fresh();
  assert.strictEqual(getSku('walkthrough').cal_event_type_id, 7030765);
  assert.strictEqual(calEventTypeIdFor('walkthrough', 1), 7030765);
  assert.strictEqual(calEventTypeIdFor('walkthrough', 2), 7030766);
  assert.strictEqual(getSku('guided-setup').cal_event_type_id, 7030767);
  assert.strictEqual(calEventTypeIdFor('guided-setup', 2), 7030768);
  assert.deepStrictEqual(getSku('walkthrough').sessions.map((s) => s.duration_min), [60, 30]);
  assert.deepStrictEqual(getSku('guided-setup').sessions.map((s) => s.duration_min), [60, 120]);
  assert.strictEqual(getSku('walkthrough').price_aud, 350);
  assert.strictEqual(getSku('guided-setup').price_aud, 700);
});

test('env overrides one session\'s id without touching the other; legacy SKUs have no default', () => {
  process.env.CAL_EVENT_TYPE_WALKTHROUGH_S2 = '4242';
  delete process.env.CAL_EVENT_TYPE_SINGLE;
  delete process.env.CAL_EVENT_TYPE_WORKING_SESSION;
  const { calEventTypeIdFor } = fresh();
  assert.strictEqual(calEventTypeIdFor('walkthrough', 2), 4242);
  assert.strictEqual(calEventTypeIdFor('walkthrough', 1), 7030765);
  assert.throws(() => calEventTypeIdFor('single-session'), /Missing env var: CAL_EVENT_TYPE_SINGLE/);
  assert.throws(() => calEventTypeIdFor('working-session'), /Missing env var: CAL_EVENT_TYPE_WORKING_SESSION/);
  delete process.env.CAL_EVENT_TYPE_WALKTHROUGH_S2;
});

test('the two price ids: the walkthrough reuses the v4 working-session price, guided setup is unchanged', () => {
  delete process.env.STRIPE_PRICE_WALKTHROUGH; delete process.env.STRIPE_PRICE_GUIDED_SETUP;
  const { getSku } = fresh();
  assert.strictEqual(getSku('walkthrough').stripe_price_id, 'price_1UDZF62MeTK4rlQYjBzaNU1l');
  assert.strictEqual(getSku('guided-setup').stripe_price_id, 'price_1UDZF62MeTK4rlQYWqYrGVnJ');
});
