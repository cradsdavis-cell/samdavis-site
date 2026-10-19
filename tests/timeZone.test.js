// tests/timeZone.test.js - bookings carry the booker's own time zone
// (2026-10-19: bookings started arriving from outside Australia).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cleanTimeZone, SAM_TIME_ZONE } = require('../lib/timeZone');
const { fmtCallTime, roadmapConfirmationText } = require('../lib/email');

test('cleanTimeZone keeps real IANA zones and falls back to Sydney for anything else', () => {
  assert.strictEqual(cleanTimeZone('Europe/London'), 'Europe/London');
  assert.strictEqual(cleanTimeZone('America/Los_Angeles'), 'America/Los_Angeles');
  assert.strictEqual(cleanTimeZone('UTC'), 'UTC');
  for (const bad of [undefined, null, '', 'Not/AZone', '<script>', 42, 'x'.repeat(100)]) {
    assert.strictEqual(cleanTimeZone(bad), SAM_TIME_ZONE, String(bad));
  }
});

test('the confirmation time is in the booker zone, with the place named', () => {
  const slot = '2026-10-20T13:00:00.000+11:00'; // Tue 1 pm in Sydney
  assert.strictEqual(fmtCallTime(slot, 'Europe/London'), 'Tue 20 Oct, 3:00 am London time (GMT+1)');
  assert.strictEqual(fmtCallTime(slot, 'America/New_York'), 'Mon 19 Oct, 10:00 pm New York time (GMT-4)');
  assert.strictEqual(fmtCallTime(slot, 'UTC'), 'Tue 20 Oct, 2:00 am UTC');
  assert.strictEqual(fmtCallTime(slot), 'Tue 20 Oct, 1:00 pm AEDT');
  assert.strictEqual(fmtCallTime(slot, 'Bogus/Zone'), 'Tue 20 Oct, 1:00 pm AEDT');
  const t = roadmapConfirmationText({ name: 'Jo', slotIso: slot, timeZone: 'America/New_York' });
  assert.match(t, /Your call is on Mon 19 Oct, 10:00 pm New York time \(GMT-4\)/);
});
