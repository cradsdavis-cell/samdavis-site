'use strict';
const { makeLoginHandler } = require('../../lib/passwordAuth');
const { defaultKv } = require('../../lib/kv');
module.exports = makeLoginHandler({ kv: defaultKv() });
