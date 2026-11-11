// tests/partners.test.js - a partner's booking code (2026-11-11, lib/partners.js)
// names who sent the booker on the booking page (via /api/code) and in the
// roadmap confirmation email, and says they'll join both calls.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { partnerForCode, partnerForPage, PARTNERS } = require('../lib/partners');

test('partnerForCode: Max owns MAJORDOME and MAJ-<n>, any case; nothing else matches', () => {
  for (const c of ['MAJORDOME', 'majordome', ' MAJ-01 ', 'MAJ-2', 'maj-123']) assert.strictEqual(partnerForCode(c).id, 'max', c);
  for (const c of ['', null, undefined, 'MAJ-', 'MAJ-1234', 'MAJORDOME2', 'LINKEDIN26', 'PITCHCLUB', 'XMAJ-01']) assert.strictEqual(partnerForCode(c), null, String(c));
});

test('partner copy: names the partner, says they join both calls, no em dashes', () => {
  for (const p of PARTNERS) {
    for (const line of [p.pageLine, p.emailLine]) {
      assert.ok(line.includes(p.name) && line.includes(p.org), line);
      assert.match(line, /both/);
      assert.ok(!line.includes('—'), 'em dash in ' + line);
    }
  }
});

test('roadmap confirmation: the partner line only appears for a partner code', () => {
  const { roadmapConfirmationText } = require('../lib/email');
  const slotIso = '2026-11-20T04:00:00.000Z';
  const withMax = roadmapConfirmationText({ name: 'Jo Bloggs', slotIso, promoCode: 'MAJ-02' });
  assert.match(withMax, /Maxime Debus from Majordome, who sent you my way, will join both calls too\./);
  assert.ok(!withMax.includes('—'));
  for (const promoCode of [undefined, '', 'LINKEDIN26']) {
    const t = roadmapConfirmationText({ name: 'Jo Bloggs', slotIso, promoCode });
    assert.ok(!t.includes('Maxime Debus'), String(promoCode));
    assert.strictEqual(t, roadmapConfirmationText({ name: 'Jo Bloggs', slotIso }));
  }
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
  const stripe = require('../lib/stripe');
  const real = stripe.quotePromotionCode;
  stripe.quotePromotionCode = fn;
  delete require.cache[require.resolve('../api/code')];
  return run(require('../api/code')).finally(() => { stripe.quotePromotionCode = real; });
}

test('/api/code: a partner code carries the page line, valid or used up; other codes carry none', () =>
  withQuote(async (code, { priceAud }) => (/^(MAJ-01|PITCHCLUB)$/.test(code) ? priceAud : null), async (api) => {
    const line = partnerForCode('MAJ-01').pageLine;
    const logo = '/lib/img/partners/majordome-mark.svg';
    let res = jsonRes();
    await api({ method: 'GET', query: { sku: 'roadmap', code: 'MAJ-01' } }, res);
    assert.deepStrictEqual(res.body, { quote: { price_aud: 250, off_aud: 250, pay_aud: 0 }, partner: { line, logo, logo_alt: 'Majordome' } });
    res = jsonRes();
    await api({ method: 'GET', query: { sku: 'roadmap', code: 'MAJ-03' } }, res);
    assert.deepStrictEqual(res.body, { quote: null, partner: { line, logo, logo_alt: 'Majordome' } });
    res = jsonRes();
    await api({ method: 'GET', query: { sku: 'roadmap', code: 'PITCHCLUB' } }, res);
    assert.deepStrictEqual(res.body, { quote: { price_aud: 250, off_aud: 250, pay_aud: 0 } });
  }));

test('the booking page shows the partner line as text, not HTML', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'book', '_slot-picker.js'), 'utf8');
  assert.match(js, /showPartnerLine\(j && j\.partner\)/);
  assert.match(js, /span\.textContent = partner\.line;/);
  assert.match(js, /img\.src = partner\.logo;/);
});

test('the webhook passes the typed code to the roadmap confirmation', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'api', 'stripe', 'webhook.js'), 'utf8');
  assert.match(js, /promoCode: metadata\.promo_code/);
});

test('partner logos: a site path that exists; anything else is dropped', () => {
  for (const p of PARTNERS) {
    if (!p.logo) continue;
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.logo)), p.logo);
    assert.strictEqual(partnerForPage(p).logo, p.logo);
  }
  const bad = { pageLine: 'x', org: 'X', logo: 'https://evil.example/x.svg' };
  assert.deepStrictEqual(partnerForPage(bad), { line: 'x' });
  assert.strictEqual(partnerForPage(null), undefined);
  const svg = fs.readFileSync(path.join(__dirname, '..', 'lib', 'img', 'partners', 'majordome-mark.svg'), 'utf8');
  assert.ok(!/<script|on[a-z]+=/i.test(svg), 'no script in the partner SVG');
});
