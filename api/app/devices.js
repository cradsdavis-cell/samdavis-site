'use strict';
// /app/devices — MACHINES first (Sam's ruling, 2026-08-10 app audit).
//
// The persistent thing on this page is a machine holding a key on a mineral's
// roster: it survives sign-outs, browser updates and the 60-day session life.
// Sessions are the ephemeral layer, and building the page around them is
// exactly why it used to feel like nothing here persisted (each sign-in was a
// new "device"; each expiry silently deleted one).
//
// So: one row per machine, from the rosters the minerals themselves mirror
// upward (names and dates, never keys). Session state folds ON to a machine's
// row where the labels line up; sessions that match no machine are listed
// separately and called what they are. Removing a machine stages a revoke the
// MINERAL verifies and applies on its own disk; this page never touches a
// roster.
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { parseSessionFromRequest, verifySession } = require('../../lib/auth');
const { renderAppShell, renderTime, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');

// "Sam's MacBook" and "sams-macbook" are the same machine: compare on the
// slug shape both sides reduce to.
const slugish = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** One row per machine across every mineral the account holds; sessions fold on. */
function assembleMachines({ minerals = [], sessions = [] }) {
  const machines = new Map();
  // a machine answers to BOTH its handles: the roster's slug and its human
  // label. "Sam's MacBook" and sams-macbook must land on one row, and a
  // session labelled either way must find it. Different sluggers drop
  // apostrophes differently, so a single normalisation cannot be trusted.
  const byHandle = new Map();
  for (const m of minerals) {
    for (const d of m.devices || []) {
      if (d.status !== 'active') continue;
      const handles = [slugish(d.slug), slugish(d.label)].filter(Boolean);
      let row = handles.map((h) => byHandle.get(h)).find(Boolean);
      if (!row) {
        row = { key: handles[0], label: d.label || d.slug, added: d.added || '', opens: [] };
        machines.set(row.key, row);
      }
      for (const h of handles) byHandle.set(h, row);
      row.opens.push({ mineral: m.label || m.host || 'a mineral', mineral_id: m.mineral_id, slug: d.slug, host: m.host || '' });
      if (d.added && (!row.added || d.added < row.added)) row.added = d.added;
    }
  }
  const orphanSessions = [];
  for (const s of sessions) {
    const row = byHandle.get(slugish(s.label));
    if (row) {
      if (!row.session || String(s.last_seen || '') > String(row.session.last_seen || '')) row.session = s;
    } else {
      orphanSessions.push(s);
    }
  }
  return {
    machines: [...machines.values()].sort((a, b) => String(a.label).localeCompare(String(b.label))),
    orphanSessions,
  };
}

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;
  const payload = verifySession(parseSessionFromRequest(req)) || {};

  const dir = directoryFor(user);
  const [minR, sessions] = await Promise.all([
    typeof dir.minerals === 'function' ? dir.minerals().catch((e) => ({ ok: false, reason: String(e && e.message || e) })) : { ok: false, reason: 'unreadable' },
    kv.listSessions(user.email).catch(() => []),
  ]);
  sessions.sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')));

  const { machines, orphanSessions } = assembleMachines({
    minerals: minR.ok ? minR.minerals : [],
    sessions,
  });

  let main = `<h1>Devices</h1>
<p class="lead">The machines that can open your minerals. A machine stays here until you remove it; signing out of the website does not touch its keys.</p>`;

  // a staged-removal failure comes back on the redirect; showing it beats a
  // silent bounce that looks like the button did nothing
  const problem = (() => { try { return new URL(req.url, 'http://x').searchParams.get('problem') || ''; } catch { return ''; } })();
  if (problem) main += `<div class="problem"><b>The removal could not be staged.</b><div class="note">${escapeHtml(problem)}</div></div>`;

  if (!minR.ok) {
    main += `<div class="problem"><b>Could not read your minerals&#8217; rosters just now.</b>
      <div class="note">${escapeHtml(minR.reason)}. The machines below may be incomplete; nothing has changed on the minerals themselves.</div></div>`;
  }

  if (machines.length) {
    for (const mc of machines) {
      const opens = mc.opens.map((o) => `<b>${escapeHtml(o.mineral)}</b>`).join(', ');
      const sessionLine = mc.session
        ? `<div class="sub">signed in here &middot; last seen ${renderTime(mc.session.last_seen)}</div>`
        : '';
      const removeForms = mc.opens.map((o) => `<form method="POST" action="/api/app/device-remove" style="display:inline;margin-right:.5em"
        onsubmit="return confirm('Remove ${escapeHtml(mc.label)}\\u2019s key from ${escapeHtml(o.mineral)}? The mineral applies this itself, usually within a couple of minutes.')">
        <input type="hidden" name="mineral_id" value="${escapeHtml(o.mineral_id)}">
        <input type="hidden" name="slug" value="${escapeHtml(o.slug)}">
        <button class="act quiet" type="submit">Remove from ${escapeHtml(o.mineral)}</button>
      </form>`).join('');
      main += `<div class="card">
  <h2>${escapeHtml(mc.label)}</h2>
  <div class="sub">can open ${opens}${mc.added ? ` &middot; added ${escapeHtml(mc.added)}` : ''}</div>
  ${sessionLine}
  <div style="margin-top:.7em">${removeForms}</div>
</div>`;
    }
  } else if (minR.ok) {
    main += `<div class="empty"><b>No machines are enrolled yet.</b>
      <p class="note">A machine appears here once a mineral&#8217;s roster admits its key. Add one from the Crads-AI app on that machine: sign in, and use &#8220;Connect this computer&#8221;.</p></div>`;
  }

  // sessions that match no enrolled machine: the ephemeral layer, named as such
  if (orphanSessions.length || !payload.sid) {
    main += '<h1 style="margin-top:1.6em;font-size:1.15em">Signed-in sessions</h1>\n<p class="note">Website and app sign-ins that don’t match an enrolled machine. These expire on their own after 60 days.</p>';
    if (!payload.sid) {
      main += `<div class="card"><h2>This browser <span class="chip warn">older sign-in</span></h2>
        <div class="sub">This session predates the device list. Sign out and back in and it becomes listed and revocable.</div></div>`;
    }
    for (const s of orphanSessions) {
      const current = s.sid === payload.sid;
      main += `<div class="card">
  <h2>${escapeHtml(s.label || 'Unknown session')}${current ? ' <span class="chip good">this browser</span>' : ''}</h2>
  <div class="sub">signed in ${renderTime(s.created_at)} &middot; last seen ${renderTime(s.last_seen)}</div>
  ${current ? '' : `<form method="POST" action="/api/app/device-revoke" style="margin-top:.7em">
    <input type="hidden" name="sid" value="${escapeHtml(s.sid)}">
    <button class="act quiet" type="submit">Sign this session out</button>
  </form>`}
</div>`;
    }
  }

  main += `<div class="card" style="margin-top:1.2em">
  <h2>Sign out everywhere</h2>
  <div class="sub">Ends every session on every machine within the hour. Enrolled machines keep their keys; remove those above.</div>
  <form method="POST" action="/api/app/device-revoke" style="margin-top:.7em"
        onsubmit="return confirm('Sign out every session, including this one?')">
    <input type="hidden" name="everywhere" value="1">
    <button class="act" type="submit">Sign out everywhere</button>
  </form>
</div>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Devices', active: 'devices', email: user.email, isAdmin: isAdmin(user.email), main }));
};
module.exports.assembleMachines = assembleMachines;
