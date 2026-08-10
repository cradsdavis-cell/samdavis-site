'use strict';
// /app/activity — what happened around this account's minerals (Sam's ruling,
// 2026-08-10 app audit: history lives HERE, dated, and the minerals page never
// shows it).
//
// v1 sources: tie endings (the directory already records these per account,
// 30-day life). Enrolment and removal outcomes join as the mineral-side
// feeds mature. An empty feed is a statement, not an apology.
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, renderTime, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const dir = directoryFor(user);
  const notR = typeof dir.notices === 'function'
    ? await dir.notices().catch((e) => ({ ok: false, reason: String(e && e.message || e) }))
    : { ok: false, reason: 'unreadable' };

  let main = `<h1>Activity</h1>
<p class="lead">What has happened around this account&#8217;s minerals. Entries age out on their own.</p>`;

  if (!notR.ok) {
    main += `<div class="problem"><b>Could not read the activity feed just now.</b>
      <div class="note">${escapeHtml(notR.reason)}. Nothing shown is missing from your minerals; this page could not ask.</div></div>`;
  } else {
    const events = (notR.notices || [])
      .map((n) => ({
        at: n.at || 0,
        title: `Your ${n.tie === 'anchored' ? 'anchor' : 'membership'} at ${n.org_display || n.org} ended`,
        detail: n.reason && !/^no reason$/i.test(String(n.reason).trim()) ? n.reason : '',
      }))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    if (events.length) {
      for (const e of events) {
        main += `<div class="card">
  <h2>${escapeHtml(e.title)}</h2>
  <div class="sub">${e.at ? renderTime(new Date(e.at).toISOString()) : ''}${e.detail ? ` &middot; ${escapeHtml(e.detail)}` : ''}</div>
</div>`;
      }
    } else {
      main += `<div class="empty"><b>Nothing recent.</b>
        <p class="note">Tie changes, device enrolments and removals will appear here as they happen.</p></div>`;
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Activity', active: 'activity', email: user.email, isAdmin: isAdmin(user.email), main }));
};
