// tests/codeQuote.test.js - a ?code= link on a booking page shows the price
// the visitor will pay (2026-11-04): lib/stripe quotePromotionCode works out
// the A$ off from the Stripe promotion code, api/code.js answers the page.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// A fake Stripe SDK: promotion codes by code, prices by id.
const PROMOS = {
  PITCHCLUB: { coupon: { valid: true, percent_off: 100, applies_to: { products: ['prod_roadmap'] } } },
  HALF: { coupon: { valid: true, percent_off: 50 } },
  FIFTY: { coupon: { valid: true, amount_off: 5000, currency: 'aud' } },
  USD50: { coupon: { valid: true, amount_off: 5000, currency: 'usd' } },
  GUIDED: { coupon: { valid: true, percent_off: 100, applies_to: { products: ['prod_guided'] } } },
  DEAD: { coupon: { valid: false, percent_off: 100 } },
  BIGMIN: { coupon: { valid: true, percent_off: 100 }, restrictions: { minimum_amount: 100000 } },
};
const calls = [];
function FakeStripe() {
  return {
    promotionCodes: { list: async (q) => { calls.push(q); const p = PROMOS[q.code]; return { data: p ? [p] : [] }; } },
    prices: { retrieve: async (id) => ({ id, product: id === 'price_roadmap' ? 'prod_roadmap' : 'prod_other' }) },
  };
}
require.cache[require.resolve('stripe')] = { exports: FakeStripe };
const { quotePromotionCode } = require('../lib/stripe');

const ROADMAP = { priceId: 'price_roadmap', priceAud: 250 };

test('quotePromotionCode: what each kind of code takes off A$250', async () => {
  assert.strictEqual(await quotePromotionCode('PITCHCLUB', ROADMAP), 250);
  assert.strictEqual(await quotePromotionCode('HALF', ROADMAP), 125);
  assert.strictEqual(await quotePromotionCode('FIFTY', ROADMAP), 50);
  assert.deepStrictEqual(calls[0], { code: 'PITCHCLUB', active: true, limit: 1, expand: ['data.coupon.applies_to'] });
});

test('quotePromotionCode: unknown, invalid, wrong product, wrong currency or under the minimum is null', async () => {
  for (const code of ['NOPE', 'DEAD', 'GUIDED', 'USD50', 'BIGMIN']) {
    assert.strictEqual(await quotePromotionCode(code, ROADMAP), null, code);
  }
  // A product-restricted code cannot be matched to an inline price.
  assert.strictEqual(await quotePromotionCode('PITCHCLUB', { priceId: null, priceAud: 250 }), null);
});

// ---- api/code.js -----------------------------------------------------------

function jsonRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  return res;
}

function withQuote(fn, run) {
  const real = require('../lib/stripe').quotePromotionCode;
  require('../lib/stripe').quotePromotionCode = fn;
  delete require.cache[require.resolve('../api/code')];
  return run(require('../api/code')).finally(() => { require('../lib/stripe').quotePromotionCode = real; });
}

test('/api/code: a code that applies gets the list price, the A$ off and what they pay', () =>
  withQuote(async (code, { priceAud }) => (code === 'PITCHCLUB' ? priceAud : null), async (api) => {
    const res = jsonRes();
    await api({ method: 'GET', query: { sku: 'roadmap', code: 'PITCHCLUB' } }, res);
    assert.deepStrictEqual(res.body, { quote: { price_aud: 250, off_aud: 250, pay_aud: 0 } });
    assert.strictEqual(res.headers['cache-control'], 'no-store');
  }));

test('/api/code: bad format, unknown SKU, a miss or Stripe failing all answer quote null', () =>
  withQuote(async (code) => { if (code === 'BOOM') throw new Error('stripe down'); return null; }, async (api) => {
    for (const query of [{ sku: 'roadmap', code: 'NOPE' }, { sku: 'roadmap', code: 'BOOM' }, { sku: 'roadmap', code: '<script>' }, { sku: 'nope', code: 'PITCHCLUB' }, { sku: 'roadmap' }]) {
      const res = jsonRes();
      const err = console.error; console.error = () => {};
      try { await api({ method: 'GET', query }, res); } finally { console.error = err; }
      assert.deepStrictEqual(res.body, { quote: null }, JSON.stringify(query));
    }
    const res = jsonRes();
    await api({ method: 'POST', query: {} }, res);
    assert.strictEqual(res.statusCode, 405);
  }));

test('the booking page asks /api/code for a link code and keeps the referral banner out of its way', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'book', '_slot-picker.js'), 'utf8');
  assert.match(js, /\/api\/code\?sku=/);
  assert.match(js, /free with your code/);
  assert.match(js, /if \(!refDiscount \|\| codeQuote\) return;/);
});
