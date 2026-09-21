// lib/terms.js: the terms version a buyer agrees to at checkout.
// Bump TERMS_VERSION in the same commit that publishes a new docs/terms page,
// so the Stripe metadata on each payment names the text that customer saw.
'use strict';

const TERMS_VERSION = '0.8';
const TERMS_PATH = '/docs/terms';
const REFUNDS_ANCHOR = '10-paid-sessions-cancelling-and-refunds';

module.exports = { TERMS_VERSION, TERMS_PATH, REFUNDS_ANCHOR };
