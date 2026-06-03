'use strict';
const { makeSetPasswordHandler } = require('../../lib/passwordAuth');
const { defaultKv } = require('../../lib/kv');
module.exports = makeSetPasswordHandler({ kv: defaultKv() });
