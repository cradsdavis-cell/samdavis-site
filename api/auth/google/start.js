'use strict';
const crypto = require('crypto');
const { getAuthUrl } = require('../../../lib/googleAuth');

module.exports = async function handler(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);
  res.writeHead(302, { Location: getAuthUrl(state) });
  res.end();
};
