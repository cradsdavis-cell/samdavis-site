'use strict';
const { requireAdmin } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin({ kv: defaultKv(), req, res });
  if (!admin) return;

  const { email, notes } = req.body || {};
  if (!email) return res.status(400).json({ error: 'missing_email' });

  const kv = defaultKv();
  const user = await kv.getUser(email);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  user.notes_from_sam = notes || null;
  await kv.setUser(email, user);
  return res.redirect(302, `/account/admin/client?email=${encodeURIComponent(email)}`);
};
