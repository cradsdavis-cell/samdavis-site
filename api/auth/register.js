'use strict';
const { makeRegisterHandler } = require('../../lib/passwordAuth');
const { defaultKv } = require('../../lib/kv');
module.exports = makeRegisterHandler({ kv: defaultKv() });
