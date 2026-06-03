'use strict';
const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const kv = defaultKv();
  const users = await kv.listUsers();
  const now = new Date();
  let transitioned = 0;

  for (const user of users) {
    if (user.state !== 'post-s4-decision') continue;
    const updated = new Date(user.state_updated_at);
    const daysSince = Math.floor((now - updated) / 86400000);
    if (daysSince < 14) continue;
    // Check if they have an active retainer engagement
    const hasRetainer = (user.engagements || []).some(e => e.type === 'continuation-retainer' && e.active);
    if (hasRetainer) {
      user.state = 'retainer-active';
    } else {
      user.state = 'graduated';
    }
    user.state_updated_at = now.toISOString();
    await kv.setUser(user.email, user);
    transitioned++;
  }

  return res.status(200).json({ transitioned, total: users.length });
};
