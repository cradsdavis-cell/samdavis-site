// tests/certificates.test.js - the Crads AI completion certificate (lib/certificates.js,
// scripts/certificate-page.js). Pins the wording guardrails (completion certificate,
// never accredited / certification / qualification), the ID format, and the privacy
// rule: every certificate page is noindex and nothing in certificates/ lists holders.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const C = require('../lib/certificates.js');
const { certificatePage, indexPage, validate } = require('../scripts/certificate-page.js');
const { navHTML } = require('../lib/site.js');

const DIR = path.join(__dirname, '..', 'certificates');
const sample = { id: 'CA-7K3M9Q', name: 'Ana Example', program: 'guided-setup', issued: '2026-11-23' };

test('every program has a title, an offer, a format and criteria', () => {
  for (const [key, p] of Object.entries(C.PROGRAMS)) {
    assert.ok(p.title && p.offer && p.format, `${key} incomplete`);
    assert.ok(Array.isArray(p.criteria) && p.criteria.length >= 3, `${key} needs real criteria`);
  }
  assert.deepStrictEqual(Object.keys(C.PROGRAMS).sort(), ['group-walkthrough', 'guided-setup', 'walkthrough']);
});

test('wording never claims accreditation, a certification or a qualification', () => {
  const claims = [
    ...Object.values(C.PROGRAMS).flatMap((p) => [p.title, p.format, ...p.criteria]),
    C.PASS_MARK, C.EXPIRY,
  ].join(' ');
  assert.doesNotMatch(claims, /accredit|certification|qualification|certified/i);
  // The one place these words may appear is the plain statement of what it is not.
  assert.match(C.WHAT_IT_IS, /^A completion certificate from Crads AI\. It is not an accredited/);
});

test('IDs: the generator makes valid IDs and the check box forgives typing', () => {
  let n = 0;
  const seq = (m) => (n++ * 7) % m;
  for (let i = 0; i < 50; i++) assert.ok(C.isValidId(C.newId(seq)));
  assert.ok(!C.isValidId('CA-0OIL11'), 'ambiguous characters are not in the alphabet');
  assert.strictEqual(C.normaliseId(' ca-7k3m9q '), 'CA-7K3M9Q');
  assert.strictEqual(C.normaliseId('7K3M9Q'), 'CA-7K3M9Q');
  assert.strictEqual(C.normaliseId('CA7K3M9Q'), 'CA-7K3M9Q');
  assert.strictEqual(C.normaliseId('CAB234'), 'CA-CAB234', 'a 6-character ID starting CA keeps its letters');
});

test('a certificate page is noindex, canonical, carries its own nav and escapes the name', () => {
  const html = certificatePage({ ...sample, name: 'Ana <script>alert(1)</script> "Example"' });
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/crads-ai\.com\/certificates\/CA-7K3M9Q">/);
  assert.ok(html.includes(navHTML('/certificates/CA-7K3M9Q')));
  assert.ok(!html.includes('<script>alert'), 'name must be escaped');
  assert.ok(html.includes('Ana &lt;script&gt;'));
  assert.ok(!html.includes('—'), 'no em dashes');
  for (const c of C.PROGRAMS['guided-setup'].criteria) assert.ok(html.includes(c.replace(/,/g, ',')), `criterion missing: ${c}`);
  assert.match(html, /Valid\. Issued by Crads AI\./);
  assert.ok(html.includes('linkedin.com/profile/add?startTask=CERTIFICATION_NAME'));
});

test('a withdrawn certificate says so and offers no LinkedIn claim', () => {
  const html = certificatePage({ ...sample, withdrawn: '2026-12-01' });
  assert.match(html, /Withdrawn on 1 December 2026/);
  assert.ok(!html.includes('linkedin.com/profile/add'));
});

test('the LinkedIn link and CV line name the program as a completion certificate', () => {
  const u = new URL(C.linkedinAddUrl(sample));
  assert.strictEqual(u.searchParams.get('name'), 'Building your own AI assistant (completion certificate)');
  assert.strictEqual(u.searchParams.get('organizationName'), 'Crads AI');
  assert.strictEqual(u.searchParams.get('certId'), 'CA-7K3M9Q');
  assert.strictEqual(u.searchParams.get('certUrl'), 'https://crads-ai.com/certificates/CA-7K3M9Q');
  assert.strictEqual(u.searchParams.get('issueMonth'), '11');
  assert.strictEqual(C.cvLine(sample), 'Building your own AI assistant, completion certificate, Crads AI, November 2026');
});

test('validate rejects bad input before anything is written', () => {
  assert.deepStrictEqual(validate(sample), []);
  assert.strictEqual(validate({ ...sample, id: 'CA-1234' }).length, 1);
  assert.strictEqual(validate({ ...sample, program: 'done-for-you' }).length, 1);
  assert.strictEqual(validate({ ...sample, issued: '2026-02-30' }).length, 1);
  assert.strictEqual(validate({ ...sample, name: '  ' }).length, 1);
});

test('the index page explains every program and is current', () => {
  const html = indexPage();
  for (const p of Object.values(C.PROGRAMS)) assert.ok(html.includes(p.title));
  assert.ok(!html.includes('—'));
  assert.strictEqual(fs.readFileSync(path.join(DIR, 'index.html'), 'utf8'), html,
    'certificates/index.html is stale: run node scripts/certificate-page.js index');
});

test('certificates/ holds only the index and one noindex page per valid ID (no register, no lists)', () => {
  for (const f of fs.readdirSync(DIR)) {
    if (f === 'index.html') continue;
    const m = f.match(/^(CA-[A-Z0-9]{6})\.html$/);
    assert.ok(m, `unexpected file in certificates/: ${f} (the holder register lives in the brain, never here)`);
    assert.ok(C.isValidId(m[1]), `${f}: not a valid certificate ID`);
    assert.match(fs.readFileSync(path.join(DIR, f), 'utf8'), /<meta name="robots" content="noindex">/, `${f} must be noindex`);
  }
});
