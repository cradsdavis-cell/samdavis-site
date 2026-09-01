'use strict';
// /app — the gated product surface (arc A). The root just decides where you
// land: signed out goes to the sign-in card (requireAuth's redirect), signed in
// goes to your minerals, which is the account's first screen by ruling 4.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;
  return res.redirect(302, '/app/minerals');
};
