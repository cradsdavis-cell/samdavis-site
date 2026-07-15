// api/admin/users-state.js
// Token-authed, read-only snapshot of every client's lifecycle state — consumed by
// the second-brain EA's coaching state-reconcile sync (runs headless on a VPS cron,
// so it can't use the session auth the browser admin UI endpoints in this dir use).
//
// Auth: Authorization: Bearer <secret>, where <secret> = CRON_SECRET_2 (preferred) || CRON_SECRET.
// Method: GET only.
// Returns ONLY non-sensitive lifecycle fields (field-whitelisted) — never auth tokens,
// passwords, or any secret material, even if present on the record.
'use strict';

const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  const expected = process.env.CRON_SECRET_2 || process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const kv = defaultKv();
    const users = await kv.listUsers();

    const out = users.map((u) => ({
      email: u.email || null,
      name: u.name || null,
      state: u.state || null,                       // onboarding-incomplete | onboarding-complete | post-s4-decision | retainer-active | graduated | ...
      state_updated_at: u.state_updated_at || null,
      stripe_customer_id: u.stripe_customer_id || null,
      stripe_subscription_id: u.stripe_subscription_id || null,
      engagements: Array.isArray(u.engagements)
        ? u.engagements.map((e) => ({
            type: e.type || null,                   // single-session | coaching-block | continuation-retainer
            active: !!e.active,
            completed: !!e.completed,
            purchased_at: e.purchased_at || e.started_at || null,
          }))
        : [],
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ count: out.length, users: out });
  } catch (err) {
    console.error('[admin/users-state] error', err && err.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
