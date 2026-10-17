'use strict';
// Where a booking came from (2026-10-17, lib/attribution.js): the optional
// "How did you hear about this?" dropdown on Stripe Checkout, and the
// utm_source tag on the booking page link. Both land on the Cal booking.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/attribution');

test('the dropdown offers the eight agreed answers, in order, and is optional', () => {
  assert.deepStrictEqual(A.HEARD_FROM_OPTIONS.map((o) => o.label), [
    'LinkedIn', 'Impact Collab', 'A WhatsApp group', 'A friend or client',
    'An event', 'Email from Sam', 'Search', 'Other',
  ]);
  const f = A.heardFromField();
  assert.strictEqual(f.key, 'heard_from');
  assert.strictEqual(f.type, 'dropdown');
  assert.strictEqual(f.optional, true);
  assert.strictEqual(f.label.custom, 'How did you hear about this? (optional)');
  for (const o of f.dropdown.options) assert.match(o.value, /^[a-z0-9]+$/, 'Stripe dropdown values are alphanumeric');
});

test('heardFromValue reads the answer and drops anything off the list', () => {
  const s = (v) => ({ custom_fields: [{ key: 'referrer', text: { value: 'x' } }, { key: 'heard_from', dropdown: { value: v } }] });
  assert.strictEqual(A.heardFromValue(s('linkedin')), 'linkedin');
  assert.strictEqual(A.heardFromValue(s(null)), '');
  assert.strictEqual(A.heardFromValue(s('<script>')), '');
  assert.strictEqual(A.heardFromValue({}), '');
});

test('cleanUtmSource makes a short lowercase slug', () => {
  assert.strictEqual(A.cleanUtmSource('LinkedIn'), 'linkedin');
  assert.strictEqual(A.cleanUtmSource('job-ad_oct'), 'job-ad_oct');
  assert.strictEqual(A.cleanUtmSource('a b<c>"d'), 'abcd');
  assert.strictEqual(A.cleanUtmSource('x'.repeat(80)).length, 40);
  assert.strictEqual(A.cleanUtmSource(undefined), '');
});

test('createCheckoutSession asks both questions and carries utm_source', async () => {
  let params = null;
  const stripePath = require.resolve('stripe');
  const saved = require.cache[stripePath];
  require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: function Stripe() { return { checkout: { sessions: { create: async (p) => { params = p; return { id: 'cs', url: 'u' }; } } } }; } };
  delete require.cache[require.resolve('../lib/stripe')];
  try {
    const { createCheckoutSession } = require('../lib/stripe');
    await createCheckoutSession({ sku: 'roadmap', priceId: 'p', name: 'B', email: 'b@x.com', calEventTypeId: 1, baseUrl: 'https://crads-ai.com', utmSource: 'linkedin' });
    assert.deepStrictEqual(params.custom_fields.map((f) => f.key), ['referrer', 'heard_from']);
    assert.strictEqual(params.metadata.utm_source, 'linkedin');
    await createCheckoutSession({ sku: 'roadmap', priceId: 'p', name: 'B', email: 'b@x.com', calEventTypeId: 1, baseUrl: 'https://crads-ai.com' });
    assert.strictEqual(params.metadata.utm_source, '');
  } finally {
    if (saved) require.cache[stripePath] = saved; else delete require.cache[stripePath];
    delete require.cache[require.resolve('../lib/stripe')];
  }
});

test('createBooking puts heard_from and utm_source on the Cal metadata only when present', async () => {
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { status: 201, ok: true, text: async () => '{"data":{"id":1}}' }; };
  delete require.cache[require.resolve('../lib/cal')];
  try {
    const { createBooking } = require('../lib/cal');
    const base = { eventTypeId: 1, slotIso: '2026-10-20T00:00:00Z', name: 'B', email: 'b@x.com', stripeSessionId: 'cs_1', sku: 'roadmap' };
    await createBooking({ ...base, heardFrom: 'whatsapp', utmSource: 'linkedin' });
    await createBooking(base);
    assert.deepStrictEqual(sent[0].metadata, { stripe_session_id: 'cs_1', sku: 'roadmap', heard_from: 'whatsapp', utm_source: 'linkedin' });
    assert.deepStrictEqual(sent[1].metadata, { stripe_session_id: 'cs_1', sku: 'roadmap' });
  } finally {
    global.fetch = realFetch;
    delete require.cache[require.resolve('../lib/cal')];
  }
});

test('the booking form sends the page link\'s utm_source and stores nothing', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'book', '_slot-picker.js'), 'utf8');
  assert.match(js, /utm_source: new URLSearchParams\(window\.location\.search\)\.get\('utm_source'\)/);
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(js), 'no browser storage on the booking form');
});
