// api/admin/set-balance.js — admin sets a client's per-engagement session balance and
// (optionally) their Drive folder link. Needed because many sessions were booked out of
// band (direct calendar invites), so the auto-derived balance won't match reality — Sam
// corrects it here. Also lets Sam record a second block a client bought via a Stripe
// invoice (outside the site checkout) by bumping sessions_total.
'use strict';
const { requireAdmin } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { nextBlockStage } = require('../../lib/autoAdvance');

const BLOCK_TYPES = new Set(['coaching-block', 'coaching-block-pay4']);

function toIntOrNull(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const kv = defaultKv();
  const admin = await requireAdmin({ kv, req, res });
  if (!admin) return;

  const { email, index, sessions_total, sessions_used, drive_folder_url } = req.body || {};
  if (!email) return res.status(400).json({ error: 'missing_email' });

  const user = await kv.getUser(email);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  // Drive folder link (optional) — only accept http(s) or an empty string (to clear).
  if (typeof drive_folder_url === 'string') {
    const u = drive_folder_url.trim();
    if (u === '') delete user.drive_folder_url;
    else if (/^https?:\/\//i.test(u)) user.drive_folder_url = u;
  }

  // Per-engagement balance edit (index into engagements[]).
  const idx = toIntOrNull(index);
  if (idx !== null) {
    const eng = (user.engagements || [])[idx];
    if (!eng) return res.status(400).json({ error: 'bad_engagement_index' });
    const total = toIntOrNull(sessions_total);
    const used = toIntOrNull(sessions_used);
    if (total !== null) eng.sessions_total = Math.max(0, total);
    if (used !== null) eng.sessions_used = Math.max(0, used);
    if (typeof eng.sessions_total === 'number' && typeof eng.sessions_used === 'number' && eng.sessions_used > eng.sessions_total) {
      eng.sessions_used = eng.sessions_total;
    }
    // Keep the journey stage in step with the count Sam just set (forward-only).
    if (BLOCK_TYPES.has(eng.type) && !eng.completed && typeof eng.sessions_used === 'number') {
      const advanced = nextBlockStage(user.state, eng.sessions_used);
      if (advanced) { user.state = advanced; user.state_updated_at = new Date().toISOString(); }
    }
  }

  await kv.setUser(email, user);
  return res.redirect(302, `/account/admin/client?email=${encodeURIComponent(email)}`);
};
