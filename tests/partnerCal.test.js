// tests/partnerCal.test.js - a partner's code (2026-11-11, lib/partners.js):
// the booking page offers only times both Sam and the partner are free, checkout
// refuses a time the partner is busy, and the Cal booking invites the partner.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

process.env.PARTNER_MAX_CAL = 'maxime-debus/roadmap';
process.env.PARTNER_MAX_EMAIL = 'max@example.com';

const P = require('../lib/partners');
const MAX = P.partnerForCode('MAJORDOME');

test('partnerCal and partnerGuestEmail read the env, and refuse junk', () => {
  assert.deepStrictEqual(P.partnerCal(MAX), { username: 'maxime-debus', eventTypeSlug: 'roadmap' });
  assert.strictEqual(P.partnerGuestEmail(MAX), 'max@example.com');
  for (const v of ['', 'nouser', 'a/b/c', 'https://cal.com/x/y', 'max/../etc']) assert.strictEqual(P.partnerCal(MAX, { PARTNER_MAX_CAL: v }), null, v);
  for (const v of ['', 'nope', 'a@b', 'a@b.com, c@d.com', '<a@b.com>']) assert.strictEqual(P.partnerGuestEmail(MAX, { PARTNER_MAX_EMAIL: v }), null, v);
  assert.strictEqual(P.partnerCal(null), null);
});

test('intersectSlots keeps only Sam slots that start when the partner is free, across offsets', () => {
  const sam = {
    '2026-11-20': [{ time: '2026-11-20T15:00:00+11:00' }, { time: '2026-11-20T15:30:00+11:00' }],
    '2026-11-21': [{ time: '2026-11-21T10:00:00+11:00' }],
  };
  const max = { '2026-11-20': [{ start: '2026-11-20T04:00:00.000Z' }, { start: '2026-11-20T06:00:00.000Z' }] };
  assert.deepStrictEqual(P.intersectSlots(sam, max), { '2026-11-20': [{ time: '2026-11-20T15:00:00+11:00' }] });
  assert.deepStrictEqual(P.intersectSlots(sam, {}), {});
  assert.ok(P.slotInPartnerSlots('2026-11-20T15:00:00+11:00', max));
  assert.ok(!P.slotInPartnerSlots('2026-11-20T15:30:00+11:00', max));
});

// ---- lib/cal.js: public slots and guests, against a fake fetch -------------

test('getPublicSlots asks the public endpoint with no API key; createBooking adds guests only when given', async () => {
  const realFetch = global.fetch;
  const seen = [];
  global.fetch = async (url, opts = {}) => { seen.push({ url: String(url), opts }); return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'success', data: {} }) }; };
  try {
    delete require.cache[require.resolve('../lib/cal')];
    const cal = require('../lib/cal');
    const r = await cal.getPublicSlots({ username: 'maxime-debus', eventTypeSlug: 'roadmap', startDate: '2026-11-20T00:00:00Z', endDate: '2026-11-21T00:00:00Z' });
    assert.ok(r.ok);
    assert.match(seen[0].url, /^https:\/\/api\.cal\.com\/v2\/slots\?username=maxime-debus&eventTypeSlug=roadmap&start=/);
    assert.ok(!('Authorization' in (seen[0].opts.headers || {})));
    await cal.createBooking({ eventTypeId: 1, slotIso: 'x', name: 'Jo', email: 'jo@x.com', stripeSessionId: 'cs', sku: 'roadmap', guests: ['max@example.com'] });
    assert.deepStrictEqual(JSON.parse(seen[1].opts.body).guests, ['max@example.com']);
    await cal.createBooking({ eventTypeId: 1, slotIso: 'x', name: 'Jo', email: 'jo@x.com', stripeSessionId: 'cs', sku: 'roadmap' });
    assert.ok(!('guests' in JSON.parse(seen[2].opts.body)));
  } finally {
    global.fetch = realFetch;
    delete require.cache[require.resolve('../lib/cal')];
  }
});

// ---- api/cal/availability.js ------------------------------------------------

function jsonRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

const SAM = { '2026-11-20': [{ time: '2026-11-20T15:00:00+11:00' }, { time: '2026-11-20T15:30:00+11:00' }] };
const MAXFREE = { '2026-11-20': [{ start: '2026-11-20T04:00:00.000Z' }] };

function withCal(publicSlots, run) {
  const calls = [];
  require.cache[require.resolve('../lib/cal')] = {
    exports: {
      getAvailableSlots: async () => ({ ok: true, status: 200, body: { data: { slots: SAM } } }),
      getPublicSlots: async (a) => { calls.push(a); return publicSlots(a); },
    },
  };
  delete require.cache[require.resolve('../api/cal/availability')];
  const api = require('../api/cal/availability');
  return run(api, calls).finally(() => { delete require.cache[require.resolve('../lib/cal')]; });
}

const start = new Date(Date.now() + 3600000).toISOString();
const end = new Date(Date.now() + 10 * 86400000).toISOString();

test('/api/cal/availability: a partner code on the roadmap shows only shared free times', () =>
  withCal(async () => ({ ok: true, status: 200, body: { data: MAXFREE } }), async (api, calls) => {
    const res = jsonRes();
    await api({ method: 'GET', query: { sku: 'roadmap', startDate: start, endDate: end, code: 'maj-01' } }, res);
    assert.deepStrictEqual(res.body, { slots: { '2026-11-20': [{ time: '2026-11-20T15:00:00+11:00' }] } });
    assert.deepStrictEqual(calls[0], { username: 'maxime-debus', eventTypeSlug: 'roadmap', startDate: start, endDate: end });
  }));

test('/api/cal/availability: other codes, no code, or the partner calendar failing leave Sam\'s times', () =>
  withCal(async () => ({ ok: false, status: 404, body: {} }), async (api, calls) => {
    for (const code of [undefined, 'LINKEDIN26', 'MAJORDOME']) {
      const res = jsonRes();
      const err = console.error; console.error = () => {};
      try { await api({ method: 'GET', query: { sku: 'roadmap', startDate: start, endDate: end, ...(code ? { code } : {}) } }, res); } finally { console.error = err; }
      assert.deepStrictEqual(res.body, { slots: SAM }, String(code));
    }
    assert.strictEqual(calls.length, 1); // only MAJORDOME asked the partner calendar
  }));
