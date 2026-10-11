// api/newsletter/unsubscribe.js - Vercel adapter for GET|POST /api/newsletter/unsubscribe
'use strict';
const { makeUnsubscribeHandler } = require('../../lib/newsletter');
const { defaultKv } = require('../../lib/kv');

module.exports = makeUnsubscribeHandler({ kv: defaultKv() });
