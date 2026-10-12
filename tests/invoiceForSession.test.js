'use strict';
const test = require('node:test');
const assert = require('node:assert');

let session = null;
let invoice = null;
const retrievedInvoices = [];
function FakeStripe() {
  return {
    checkout: { sessions: { retrieve: async () => session } },
    invoices: { retrieve: async (id) => { retrievedInvoices.push(id); return invoice; } },
  };
}
require.cache[require.resolve('stripe')] = { exports: FakeStripe };
const { invoiceForSession } = require('../lib/stripe');

const PAID = { payment_status: 'paid', amount_total: 70000, invoice: 'in_1' };

test('paid session: returns the hosted invoice page and number', async () => {
  session = PAID;
  invoice = { number: 'DLSHBTNR-0001', hosted_invoice_url: 'https://invoice.stripe.com/i/x' };
  assert.deepStrictEqual(await invoiceForSession('cs_live_a'), { number: 'DLSHBTNR-0001', url: 'https://invoice.stripe.com/i/x' });
  assert.strictEqual(retrievedInvoices.at(-1), 'in_1');
});

test('free (A$0) roadmap session: null, no invoice lookup', async () => {
  session = { ...PAID, amount_total: 0 };
  const before = retrievedInvoices.length;
  assert.strictEqual(await invoiceForSession('cs_live_a'), null);
  assert.strictEqual(retrievedInvoices.length, before);
});

test('unpaid session or invoice not attached yet: null', async () => {
  session = { ...PAID, payment_status: 'unpaid' };
  assert.strictEqual(await invoiceForSession('cs_live_a'), null);
  session = { ...PAID, invoice: null };
  assert.strictEqual(await invoiceForSession('cs_live_a'), null);
});

test('expanded invoice object on the session is handled', async () => {
  session = { ...PAID, invoice: { id: 'in_2' } };
  invoice = { number: null, hosted_invoice_url: 'https://invoice.stripe.com/i/y' };
  assert.deepStrictEqual(await invoiceForSession('cs_live_a'), { number: null, url: 'https://invoice.stripe.com/i/y' });
  assert.strictEqual(retrievedInvoices.at(-1), 'in_2');
});
