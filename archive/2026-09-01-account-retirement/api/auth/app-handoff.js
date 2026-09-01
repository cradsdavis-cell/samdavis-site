'use strict';
const { makeHandoffHandler } = require('../../lib/appHandoff');
const { defaultKv } = require('../../lib/kv');
module.exports = makeHandoffHandler({ kv: defaultKv() });
