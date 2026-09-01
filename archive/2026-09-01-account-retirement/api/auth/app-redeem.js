'use strict';
const { makeRedeemHandler } = require('../../lib/appHandoff');
const { defaultKv } = require('../../lib/kv');
module.exports = makeRedeemHandler({ kv: defaultKv() });
