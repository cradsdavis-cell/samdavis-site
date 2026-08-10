'use strict';
// /app/devices — every machine signed in to this account (arc A3).
//
// This is the ACCOUNT layer: sessions. A mineral's SSH key roster is a
// different layer — the keys that open the machine your assistant runs on —
// and it joins this page when minerals serve their own JSON (the manage
// layer). Ruling 9 wants one unified view with two EXPLICIT actions; this
// ships the sessions half honestly rather than faking the other.
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { parseSessionFromRequest, verifySession } = require('../../lib/auth');
const { renderAppShell, renderTime, escapeHtml } = require('../../lib/appShell');

// times localise in the reader's browser (renderTime), never raw UTC

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;
  const payload = verifySession(parseSessionFromRequest(req)) || {};
  const sessions = await kv.listSessions(user.email);
  sessions.sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')));

  let rows = '';
  for (const s of sessions) {
    const current = s.sid === payload.sid;
    rows += `<div class="card">
  <h2>${escapeHtml(s.label || 'Unknown device')}${current ? ' <span class="chip good">this device</span>' : ''}</h2>
  <div class="sub">signed in ${renderTime(s.created_at)} &middot; last seen ${renderTime(s.last_seen)}</div>
  ${current ? '' : `<form method="POST" action="/api/app/device-revoke" style="margin-top:.7em">
    <input type="hidden" name="sid" value="${escapeHtml(s.sid)}">
    <button class="act quiet" type="submit">Sign this device out</button>
  </form>`}
</div>`;
  }

  const legacyNote = !payload.sid
    ? `<div class="card"><h2>This device <span class="chip warn">older sign-in</span></h2>
       <div class="sub">This session predates the device list, so it appears only as this note. Sign out and back in and it becomes a listed, revocable device like the others.</div></div>`
    : '';

  const main = `<h1>Devices</h1>
<p class="lead">Machines signed in to this account. Signing one out ends its session; it does not touch any mineral&#8217;s SSH keys, which are a separate layer you manage from the mineral itself for now.</p>
${legacyNote}
${rows || (payload.sid ? '' : '<div class="empty"><b>No listed devices yet.</b><br>New sign-ins appear here.</div>')}
<div class="card">
  <h2>Sign out everywhere</h2>
  <div class="sub">Ends every session on every machine, including the desktop app and this browser, within the hour. Use it if a device is lost or you suspect the account is compromised.</div>
  <form method="POST" action="/api/app/device-revoke" style="margin-top:.7em"
        onsubmit="return confirm('Sign out every device, including this one?')">
    <input type="hidden" name="everywhere" value="1">
    <button class="act" type="submit">Sign out everywhere</button>
  </form>
</div>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Devices', active: 'devices', email: user.email, isAdmin: isAdmin(user.email), main }));
};
