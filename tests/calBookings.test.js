'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fetchUpcomingAndPast, fetchNextSession, calManageUrl } = require('../lib/calBookings');

function stubFetch(bookings) {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: bookings }) });
}

test('upcoming includes lowercase-status "accepted" bookings', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  stubFetch([{ uid: 'abc', status: 'accepted', start: future, eventType: { title: 'Coaching Block' } }]);
  const { upcoming } = await fetchUpcomingAndPast('x@example.com');
  assert.strictEqual(upcoming.length, 1);
  assert.strictEqual(upcoming[0].uid, 'abc');
});

test('fetchNextSession returns a lowercase-accepted booking', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  stubFetch([{ uid: 'abc', status: 'accepted', start: future, eventType: { title: 'Coaching Block' } }]);
  const next = await fetchNextSession('x@example.com');
  assert.ok(next, 'expected a next session');
  assert.strictEqual(next.label, 'Coaching Block');
});

test('calManageUrl builds the Cal booking-management URL from a uid', () => {
  assert.strictEqual(calManageUrl('4TyhQHAda6qry8RFY1m6gs'), 'https://cal.com/booking/4TyhQHAda6qry8RFY1m6gs');
});
