'use strict';
// POST /api/app/device-revoke — the two explicit acts (arc A3):
//   { sid }            sign out ONE device: delete its registry row, so its
//                      JWT dies at the next requireAuth. Only ever another
//                      device — the form for the current one is not rendered,
//                      and the handler refuses it too (defense in depth).
//   { everywhere: 1 }  the global lever: bump state_version. Every JWT on
//                      every machine (and the desktop app's hourly app-token
//                      mint) fails from the next check. The registry rows are
//                      cleared too so the list does not show ghosts.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { parseSessionFromRequest, verifySession, formatLogoutCookie } = require('../../lib/auth');

function readForm(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      if (/json/i.test(String(req.headers['content-type'] || ''))) {
        try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
        return;
      }
      resolve(Object.fromEntries(new URLSearchParams(body)));
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;
  const payload = verifySession(parseSessionFromRequest(req)) || {};
  const form = await readForm(req);

  if (form.everywhere) {
    user.state_version = (user.state_version || 1) + 1;
    await kv.setUser(user.email, user);
    for (const s of await kv.listSessions(user.email)) {
      await kv.deleteSession(user.email, s.sid);
    }
    res.setHeader('Set-Cookie', formatLogoutCookie());
    return res.redirect(303, '/account/login');
  }

  const sid = String(form.sid || '');
  if (!/^[0-9a-f]{24}$/.test(sid)) return res.status(400).json({ error: 'bad_sid' });
  if (sid === payload.sid) {
    // signing out THIS device is the sign-out button, not a revoke
    return res.status(400).json({ error: 'use_sign_out_for_this_device' });
  }
  await kv.deleteSession(user.email, sid);
  return res.redirect(303, '/app/devices');
};
