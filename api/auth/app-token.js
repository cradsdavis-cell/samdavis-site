'use strict';
const { makeTokenHandler } = require('../../lib/appHandoff');
const { defaultKv } = require('../../lib/kv');
module.exports = makeTokenHandler({ kv: defaultKv() });
