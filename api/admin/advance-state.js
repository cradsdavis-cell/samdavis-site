'use strict';
const { requireAdmin } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');

const VALID_NEXT_STATES = {
  'pre-s1': ['between-s1-s2'],
  'between-s1-s2': ['between-s2-s3'],
  'between-s2-s3': ['between-s3-s4'],
  'between-s3-s4': ['post-s4-decision'],
  'post-s4-decision': ['retainer-active', 'graduated'],
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin({ kv: defaultKv(), req, res });
  if (!admin) return;

  const { email, new_state } = req.body || {};
  if (!email || !new_state) return res.status(400).json({ error: 'missing_fields' });

  const kv = defaultKv();
  const user = await kv.getUser(email);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const valid = VALID_NEXT_STATES[user.state] || [];
  if (!valid.includes(new_state)) {
    return res.status(400).json({ error: 'invalid_transition', from: user.state, to: new_state, valid });
  }

  user.state = new_state;
  user.state_updated_at = new Date().toISOString();

  // Mark relevant engagement completed if transitioning to post-s4-decision
  if (new_state === 'post-s4-decision') {
    const block = (user.engagements || []).find(e => (e.type === 'coaching-block' || e.type === 'coaching-block-pay4') && !e.completed);
    if (block) block.completed = true;
  }

  await kv.setUser(email, user);
  return res.redirect(302, `/account/admin/client?email=${encodeURIComponent(email)}`);
};
