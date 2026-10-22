'use strict';
const test = require('node:test');
const assert = require('node:assert');

const R = require('../lib/referrals');

const NOW = Date.parse('2026-10-16T08:00:00Z');
const cookieFor = (slug, ms) => `${R.COOKIE_NAME}=${R.formatCookieValue(slug, ms)}`;

// ---- lib/referrals.js -------------------------------------------------------

test('partnerFor: nim is a live partner; unknown, malformed and empty slugs are not', () => {
  assert.deepStrictEqual(R.partnerFor('nim'), { slug: 'nim', name: 'Nim', active: true });
  assert.deepStrictEqual(R.partnerFor(' NIM '), { slug: 'nim', name: 'Nim', active: true });
  assert.strictEqual(R.partnerFor('nobody'), null);
  assert.strictEqual(R.partnerFor('../etc'), null);
  assert.strictEqual(R.partnerFor(''), null);
});

test('refFromCookie: reads a live referral and its first-touch date', () => {
  const at = NOW - 5 * 86400000;
  const ref = R.refFromCookie(`other=1; ${cookieFor('nim', at)}; x=y`, NOW);
  assert.strictEqual(ref.slug, 'nim');
  assert.strictEqual(ref.at, new Date(Math.floor(at / 1000) * 1000).toISOString());
});

test('refFromCookie: older than 90 days, unknown slug or junk reads as no referral', () => {
  assert.strictEqual(R.refFromCookie(cookieFor('nim', NOW - 91 * 86400000), NOW), null);
  assert.strictEqual(R.refFromCookie(cookieFor('nobody', NOW), NOW), null);
  assert.strictEqual(R.refFromCookie(`${R.COOKIE_NAME}=nim`, NOW), null);
  assert.strictEqual(R.refFromCookie('', NOW), null);
  assert.strictEqual(R.refFromCookie(undefined, NOW), null);
});

test('setCookieHeader: 90 days, first-party, HttpOnly, Secure, Lax', () => {
  const h = R.setCookieHeader('nim.1760000000');
  assert.match(h, /^crads_ref=nim\.1760000000;/);
  assert.match(h, /Max-Age=7776000/);
  assert.match(h, /Path=\//);
  assert.match(h, /HttpOnly/);
  assert.match(h, /Secure/);
  assert.match(h, /SameSite=Lax/);
});

test('customFieldText: reads the "Who sent you?" answer, trimmed and cleaned', () => {
  const s = { custom_fields: [{ key: 'referrer', text: { value: '  Nim\nZappert  ' } }] };
  assert.strictEqual(R.customFieldText(s), 'Nim Zappert');
  assert.strictEqual(R.customFieldText({ custom_fields: [{ key: 'referrer', text: { value: null } }] }), '');
  assert.strictEqual(R.customFieldText({}), '');
});

test('suggestSlug: a partner slug named as a word is a suggestion, a substring is not', () => {
  assert.strictEqual(R.suggestSlug('Nim Zappert'), 'nim');
  assert.strictEqual(R.suggestSlug('my friend nim'), 'nim');
  assert.strictEqual(R.suggestSlug('Nimbus Consulting'), null);
  assert.strictEqual(R.suggestSlug('LinkedIn'), null);
});

const base = { sessionId: 'cs_1', email: 'buyer@example.com', name: 'Bea Buyer', slotIso: '2026-10-20T10:00:00+10:00', nowIso: '2026-10-16T08:00:00.000Z' };

test('planReferral: a guided setup with a link referral is pending-s1 at A$100', () => {
  const p = R.planReferral({ ...base, sku: 'guided-setup', meta: { ref: 'nim', ref_at: '2026-10-10T00:00:00.000Z' } });
  assert.strictEqual(p.attribution, null);
  assert.strictEqual(p.record.status, 'pending-s1');
  assert.strictEqual(p.record.referrer, 'nim');
  assert.strictEqual(p.record.amount_aud, 100);
  assert.strictEqual(p.record.via, 'link');
  assert.strictEqual(p.record.s1_at, base.slotIso);
  assert.strictEqual(p.record.first_touch_at, '2026-10-10T00:00:00.000Z');
});

test('planReferral: the roadmap pays nothing but carries the referral forward', () => {
  const p = R.planReferral({ ...base, sku: 'roadmap', meta: { ref: 'nim', ref_at: '2026-10-10T00:00:00.000Z' } });
  assert.strictEqual(p.record, null);
  assert.deepStrictEqual(p.attribution, { slug: 'nim', at: '2026-10-10T00:00:00.000Z', sku: 'roadmap', session: 'cs_1' });
});

test('planReferral: a walkthrough pays nothing', () => {
  const p = R.planReferral({ ...base, sku: 'walkthrough', meta: { ref: 'nim', ref_at: base.nowIso } });
  assert.strictEqual(p.record, null);
});

test('planReferral: a guided setup with no cookie still pays the referrer from the earlier roadmap', () => {
  const attr = { slug: 'nim', at: '2026-09-01T00:00:00.000Z', sku: 'roadmap', session: 'cs_0' };
  const p = R.planReferral({ ...base, sku: 'guided-setup', attr });
  assert.strictEqual(p.record.referrer, 'nim');
  assert.strictEqual(p.record.via, 'earlier-booking');
  assert.strictEqual(p.record.status, 'pending-s1');
});

test('planReferral: first touch wins between the stored roadmap referral and a newer cookie', () => {
  // Retire-proof: both slugs must be live partners, so add a second one for this test.
  R.PARTNERS.push({ slug: 'paz', active: true });
  try {
    const attr = { slug: 'nim', at: '2026-09-01T00:00:00.000Z' };
    const p = R.planReferral({ ...base, sku: 'guided-setup', attr, meta: { ref: 'paz', ref_at: '2026-10-01T00:00:00.000Z' } });
    assert.strictEqual(p.record.referrer, 'nim');
    const q = R.planReferral({ ...base, sku: 'guided-setup', attr: { slug: 'nim', at: '2026-10-05T00:00:00.000Z' }, meta: { ref: 'paz', ref_at: '2026-10-01T00:00:00.000Z' } });
    assert.strictEqual(q.record.referrer, 'paz');
  } finally {
    R.PARTNERS.pop();
  }
});

test('planReferral: a free-text answer alone is needs-review, with a suggestion, never pending', () => {
  const p = R.planReferral({ ...base, sku: 'guided-setup', text: 'Nim Zappert' });
  assert.strictEqual(p.record.status, 'needs-review');
  assert.strictEqual(p.record.referrer, null);
  assert.strictEqual(p.record.suggested, 'nim');
  assert.strictEqual(p.record.referrer_text, 'Nim Zappert');
});

test('planReferral: a free-text answer on the roadmap is remembered for a later guided setup', () => {
  const p = R.planReferral({ ...base, sku: 'roadmap', text: 'Gavin at Climate Action Crew' });
  assert.strictEqual(p.attribution.slug, null);
  assert.strictEqual(p.attribution.text, 'Gavin at Climate Action Crew');
  const q = R.planReferral({ ...base, sku: 'guided-setup', attr: p.attribution });
  assert.strictEqual(q.record.status, 'needs-review');
  assert.strictEqual(q.record.referrer_text, 'Gavin at Climate Action Crew');
});

test('planReferral: no referral anywhere writes nothing', () => {
  assert.deepStrictEqual(R.planReferral({ ...base, sku: 'guided-setup' }), { attribution: null, record: null });
  assert.deepStrictEqual(R.planReferral({ ...base, sku: 'roadmap' }), { attribution: null, record: null });
});

// ---- the buyer's side (2026-10-21) --------------------------------------------

function withCoupon(value, fn) {
  const saved = process.env.STRIPE_REFERRAL_COUPON;
  if (value === undefined) delete process.env.STRIPE_REFERRAL_COUPON; else process.env.STRIPE_REFERRAL_COUPON = value;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.STRIPE_REFERRAL_COUPON; else process.env.STRIPE_REFERRAL_COUPON = saved;
  }
}

test('buyerDiscountFor: A$100 off a guided setup, thanking the partner by first name', () => {
  withCoupon('referral-guided-setup-100', () => {
    assert.deepStrictEqual(R.buyerDiscountFor({ slug: 'nim', at: 'x' }, 'guided-setup'), { coupon: 'referral-guided-setup-100', aud: 100, slug: 'nim', name: 'Nim' });
    // A surname slug has no first name to show: the page says "referral discount".
    assert.deepStrictEqual(R.buyerDiscountFor({ slug: 'elderfield', at: 'x' }, 'guided-setup'), { coupon: 'referral-guided-setup-100', aud: 100, slug: 'elderfield', name: null });
  });
});

test('buyerDiscountFor: nothing off the roadmap or walkthrough, nothing without a referral', () => {
  withCoupon('referral-guided-setup-100', () => {
    assert.strictEqual(R.buyerDiscountFor({ slug: 'nim', at: 'x' }, 'roadmap'), null);
    assert.strictEqual(R.buyerDiscountFor({ slug: 'nim', at: 'x' }, 'walkthrough'), null);
    assert.strictEqual(R.buyerDiscountFor(null, 'guided-setup'), null);
    assert.strictEqual(R.buyerDiscountFor({ slug: 'nobody', at: 'x' }, 'guided-setup'), null);
  });
});

test('buyerDiscountFor: switched off until STRIPE_REFERRAL_COUPON is set (and junk does not count)', () => {
  withCoupon(undefined, () => assert.strictEqual(R.buyerDiscountFor({ slug: 'nim', at: 'x' }, 'guided-setup'), null));
  withCoupon('', () => assert.strictEqual(R.buyerDiscountFor({ slug: 'nim', at: 'x' }, 'guided-setup'), null));
  withCoupon('bad coupon!', () => assert.strictEqual(R.buyerDiscountFor({ slug: 'nim', at: 'x' }, 'guided-setup'), null));
});

test('planReferral: the record notes what the buyer got off; the fee stays A$100', () => {
  const p = R.planReferral({ ...base, sku: 'guided-setup', meta: { ref: 'nim', ref_at: base.nowIso, ref_discount_aud: '100' } });
  assert.strictEqual(p.record.buyer_discount_aud, 100);
  assert.strictEqual(p.record.amount_aud, 100);
  const q = R.planReferral({ ...base, sku: 'guided-setup', meta: { ref: 'nim', ref_at: base.nowIso } });
  assert.strictEqual(q.record.buyer_discount_aud, 0);
});

// ---- api/referral.js: what the booking page shows -------------------------------

function jsonRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}

test('/api/referral: a live cookie on the guided setup page gets the discount, the name and the price', () => {
  const api = require('../api/referral');
  withCoupon('referral-guided-setup-100', () => {
    const res = jsonRes();
    api({ method: 'GET', query: { sku: 'guided-setup' }, headers: { cookie: cookieFor('nim', Date.now() - 86400000) } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { discount: { aud: 100, name: 'Nim', price_aud: 700 } });
    assert.strictEqual(res.headers['cache-control'], 'no-store');
  });
});

test('/api/referral: no cookie, another SKU, an unknown SKU or the scheme switched off means no discount', () => {
  const api = require('../api/referral');
  const live = { cookie: cookieFor('nim', Date.now() - 86400000) };
  withCoupon('referral-guided-setup-100', () => {
    for (const [query, headers] of [[{ sku: 'guided-setup' }, {}], [{ sku: 'roadmap' }, live], [{ sku: 'nope' }, live], [{}, live]]) {
      const res = jsonRes();
      api({ method: 'GET', query, headers }, res);
      assert.deepStrictEqual(res.body, { discount: null });
    }
  });
  withCoupon(undefined, () => {
    const res = jsonRes();
    api({ method: 'GET', query: { sku: 'guided-setup' }, headers: live }, res);
    assert.deepStrictEqual(res.body, { discount: null });
  });
});

// ---- lib/kv.js referral families ----------------------------------------------

function memClient() {
  const store = new Map();
  const ttl = new Map();
  return {
    get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => (store.delete(k) ? 1 : 0),
    incr: async () => 1,
    expire: async (k, s) => { ttl.set(k, s); return 1; },
    keys: async (p) => [...store.keys()].filter((k) => k.startsWith(p.replace('*', ''))),
    _ttl: ttl,
  };
}

test('kv: countWhoElse counts per checkout session and expires after 30 days', async () => {
  const { makeKv } = require('../lib/kv');
  const counts = new Map();
  const c = { ...memClient(), incr: async (k) => { counts.set(k, (counts.get(k) || 0) + 1); return counts.get(k); } };
  const kv = makeKv(c);
  assert.strictEqual(await kv.countWhoElse('cs_1'), 1);
  assert.strictEqual(await kv.countWhoElse('cs_1'), 2);
  assert.strictEqual(c._ttl.get('who_else:cs_1'), 30 * 86400);
});

test('kv: a referral record is first-wins and listed', async () => {
  const { makeKv } = require('../lib/kv');
  const kv = makeKv(memClient());
  assert.strictEqual(await kv.addReferralIfAbsent('cs_1', { id: 'cs_1', status: 'pending-s1' }), true);
  assert.strictEqual(await kv.addReferralIfAbsent('cs_1', { id: 'cs_1', status: 'owed' }), false);
  assert.strictEqual((await kv.getReferral('cs_1')).status, 'pending-s1');
  assert.strictEqual((await kv.listReferrals()).length, 1);
});

test('kv: attribution keeps the first partner, upgrades a text answer to a partner, sets the TTL', async () => {
  const { makeKv } = require('../lib/kv');
  const c = memClient();
  const kv = makeKv(c);
  assert.strictEqual(await kv.setRefAttributionIfAbsent('a@b.com', { slug: null, text: 'a friend' }, 1000), true);
  assert.strictEqual(await kv.setRefAttributionIfAbsent('a@b.com', { slug: 'nim', at: 'x' }, 900), true);
  assert.strictEqual(await kv.setRefAttributionIfAbsent('a@b.com', { slug: 'paz', at: 'y' }, 800), false);
  assert.strictEqual((await kv.getRefAttribution('a@b.com')).slug, 'nim');
  assert.strictEqual(c._ttl.get('ref_attr:a@b.com'), 900);
});

// ---- api/r.js ---------------------------------------------------------------

function mockRes() {
  const res = { statusCode: 200, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
}
const route = require('../api/r');

test('/r/nim sets the referral cookie and goes home', () => {
  const res = mockRes();
  route({ query: { slug: 'nim' }, headers: {} }, res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.headers.location, '/');
  assert.match(res.headers['set-cookie'], /^crads_ref=nim\.\d+;/);
});

test('/r/<unknown> goes home and sets nothing', () => {
  const res = mockRes();
  route({ query: { slug: 'nobody' }, headers: {} }, res);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.headers.location, '/');
  assert.strictEqual(res.headers['set-cookie'], undefined);
});

test('/r/<slug> never overwrites a live referral (first touch wins)', () => {
  const res = mockRes();
  route({ query: { slug: 'nim' }, headers: { cookie: cookieFor('nim', Date.now() - 86400000) } }, res);
  assert.strictEqual(res.headers['set-cookie'], undefined);
});

test('/r/<slug> replaces a referral that has run past its 90 days', () => {
  const res = mockRes();
  route({ query: { slug: 'nim' }, headers: { cookie: cookieFor('nim', Date.now() - 100 * 86400000) } }, res);
  assert.match(res.headers['set-cookie'], /^crads_ref=nim\./);
});

test('vercel.json routes /r/:slug to the handler', () => {
  const v = require('../vercel.json');
  assert.ok(v.rewrites.some((r) => r.source === '/r/:slug' && r.destination === '/api/r?slug=:slug'));
});

// ---- lib/stripe.js: metadata + the "Who sent you?" field -------------------------

test('createCheckoutSession carries the ref and asks "Who sent you?" (optional)', async () => {
  let params = null;
  const stripePath = require.resolve('stripe');
  const saved = require.cache[stripePath];
  require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: function Stripe() { return { checkout: { sessions: { create: async (p) => { params = p; return { id: 'cs', url: 'u' }; } } } }; } };
  delete require.cache[require.resolve('../lib/stripe')];
  try {
    const { createCheckoutSession } = require('../lib/stripe');
    await createCheckoutSession({ sku: 'guided-setup', priceId: 'price_x', name: 'B', email: 'b@x.com', calEventTypeId: 1, baseUrl: 'https://crads-ai.com', ref: 'nim', refAt: '2026-10-10T00:00:00.000Z' });
    assert.strictEqual(params.metadata.ref, 'nim');
    assert.strictEqual(params.metadata.ref_at, '2026-10-10T00:00:00.000Z');
    const f = params.custom_fields.find((x) => x.key === 'referrer');
    assert.strictEqual(f.label.custom, 'Who sent you? (optional)');
    assert.strictEqual(f.optional, true);
    assert.strictEqual(f.type, 'text');

    await createCheckoutSession({ sku: 'roadmap', priceId: 'price_y', name: 'B', email: 'b@x.com', calEventTypeId: 1, baseUrl: 'https://crads-ai.com' });
    assert.strictEqual(params.metadata.ref, '');
    assert.strictEqual(params.metadata.ref_discount_aud, '');
    assert.strictEqual(params.allow_promotion_codes, true);
    assert.strictEqual(params.discounts, undefined);
    assert.strictEqual(params.success_url, 'https://crads-ai.com/thanks?session_id={CHECKOUT_SESSION_ID}&sku=roadmap');

    // The buyer's A$100 off (2026-10-21): the coupon is the session's one discount.
    await createCheckoutSession({ sku: 'guided-setup', priceId: 'price_x', name: 'B', email: 'b@x.com', calEventTypeId: 1, baseUrl: 'https://crads-ai.com', ref: 'nim', couponId: 'referral-guided-setup-100', refDiscountAud: 100 });
    assert.deepStrictEqual(params.discounts, [{ coupon: 'referral-guided-setup-100' }]);
    assert.strictEqual(params.allow_promotion_codes, undefined, 'Stripe refuses discounts with allow_promotion_codes');
    assert.strictEqual(params.metadata.ref_discount_aud, '100');

    // A typed code wins: never both.
    await createCheckoutSession({ sku: 'guided-setup', priceId: 'price_x', name: 'B', email: 'b@x.com', calEventTypeId: 1, baseUrl: 'https://crads-ai.com', promotionCodeId: 'promo_1', couponId: 'referral-guided-setup-100', refDiscountAud: 100 });
    assert.deepStrictEqual(params.discounts, [{ promotion_code: 'promo_1' }]);
  } finally {
    if (saved) require.cache[stripePath] = saved; else delete require.cache[stripePath];
    delete require.cache[require.resolve('../lib/stripe')];
  }
});

// ---- /referrals, the unlisted page for partners ------------------------------

test('/referrals is unlisted, out of the sitemap, and says what Sam ruled', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'referrals', 'index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.ok(!fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8').includes('/referrals'));
  const text = html.replace(/<[^>]+>/g, ' ');
  assert.match(text, /A\$100/);
  assert.match(text, /A\$100 off/, 'two-sided since 21 Oct');
  assert.ok(!/no discount code to pass on|pays the normal price/.test(text), 'the one-sided wording is gone');
  assert.match(text, /90 days/);
  assert.match(text, /first session/);
  assert.match(text, /once a month, by bank transfer/);
  assert.match(text, /mention that you get a referral fee/);
  assert.ok(!html.includes('—'), 'no em dashes');
  const { NAV_ITEMS } = require('../lib/site.js');
  assert.ok(!NAV_ITEMS.some((i) => i.href === '/referrals'), 'not in the nav');
});
