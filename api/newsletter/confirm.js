// api/newsletter/confirm.js - Vercel adapter for GET /api/newsletter/confirm
'use strict';
const { makeConfirmHandler } = require('../../lib/newsletter');
const { defaultKv } = require('../../lib/kv');

module.exports = makeConfirmHandler({ kv: defaultKv() });
