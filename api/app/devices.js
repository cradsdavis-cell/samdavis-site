'use strict';
// /app/devices — MACHINES first (Sam's ruling, 2026-08-10).
//
// The persistent thing on this page is a machine holding a key on a mineral's
// roster: it survives sign-outs, browser updates and the 60-day session life.
// Sessions are the ephemeral layer, and building the page around them is
// exactly why it used to feel like nothing here persisted (each sign-in was a
// new "device"; each expiry silently deleted one).
//
// JOINED ON IDENTITY, NOT ON NAMES (2026-08-12). This page used to decide that
// two rows were one machine by comparing the NAMES they carried, reduced to a
// slug. Sam opened it on his own rock and found "This computer" and "Win32",
// with no way to tell whether that was two machines or one machine added twice.
// It was never going to work: nothing typed those names from the machine, and
// the session labels it tried to match them against are browser families
// ("Chrome on Windows"), which no roster slug will ever equal.
//
// A machine now arrives with a machine_id: HMAC(account_salt, ssh_fingerprint),
// derived on the mineral. Stable across every mineral ONE account holds, so a
// laptop on three rosters is one row here; and a different value under any other
// account's salt, so nothing in this system can tell that the same laptop also
// opens someone else's box. Rows from a mineral running an older image have no
// machine_id yet, and those are kept separate rather than guessed at.
//
// EVERYTHING THAT CAN OPEN THE BOX, not a third of it (Sam's ruling, 2026-08-12).
// A box's door is derived from three registries: this roster, the people
// registry holding the key seeded at its birth, and a time-boxed Crads support
// grant. Only the roster ever reached this page. Support renders even when it is
// off, because an explicit off is a fact and an absent row is a question.
//
// Removing a machine stages a revoke the MINERAL verifies and applies on its own
// disk; this page never touches a roster. It takes about two minutes, so a
// staged removal renders as in-progress instead of re-rendering an unchanged
// list that reads as a button that did nothing.
const { createHash } = require('crypto');
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { parseSessionFromRequest, verifySession } = require('../../lib/auth');
const { renderAppShell, renderTime, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');

const emailHash = (email) => createHash('sha256').update(String(email || '').toLowerCase()).digest('hex');

/**
 * One row per machine across every mineral the account holds.
 *
 * The join key is machine_id. A device whose mineral has not sent one yet keys
 * on mineral+slug instead, which cannot collide with anything, so an un-updated
 * box degrades to one row per roster entry rather than to a wrong merge.
 */
function assembleMachines({ minerals = [], sessions = [], me = '' }) {
  const machines = new Map();
  for (const m of minerals) {
    const pending = new Set(m.pending_removals || []);
    for (const d of m.devices || []) {
      if (d.status !== 'active') continue;
      const key = d.machine_id || `unjoined:${m.mineral_id}:${d.slug}`;
      let row = machines.get(key);
      if (!row) {
        row = { key, machine_id: d.machine_id || '', label: d.label || d.slug, added: d.added || '', last_seen: '', mine: false, opens: [] };
        machines.set(key, row);
      }
      row.opens.push({
        mineral: m.label || m.host || 'a mineral', mineral_id: m.mineral_id, slug: d.slug,
        vault: !!d.vault, removing: pending.has(d.slug),
      });
      if (d.added && (!row.added || d.added < row.added)) row.added = d.added;
      // the most recent sighting across every mineral it opens: one machine, one
      // "last seen", however many boxes it reaches
      if (String(d.last_seen || '') > String(row.last_seen || '')) row.last_seen = d.last_seen || '';
      if (me && d.account_e === me) row.mine = true;
    }
  }
  // A browser holds a cookie, not a key, so it cannot prove which machine it is
  // on and never folds onto one. Only a session carrying a machine_id could, and
  // today none do: the app would have to send it at handoff. Guessing from a
  // user-agent is what produced "Win32" in the first place.
  const byMachine = new Map([...machines.values()].map((r) => [r.machine_id, r]).filter(([id]) => id));
  const orphanSessions = [];
  for (const s of sessions) {
    const row = s.machine_id ? byMachine.get(s.machine_id) : null;
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

/** The birth keys and support grants across every mineral, as rows to render. */
function assembleDoor(minerals = []) {
  const founders = [];
  const support = [];
  for (const m of minerals) {
    const name = m.label || m.host || 'a mineral';
    const door = m.door || {};
    for (const f of door.founders || []) founders.push({ mineral: name, who: f.name, machine_ids: f.machine_ids || [] });
    if (door.support) support.push({ mineral: name, ...door.support });
  }
  return { founders, support };
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

  const mineralRows = minR.ok ? minR.minerals : [];
  const { machines, orphanSessions } = assembleMachines({
    minerals: mineralRows, sessions, me: emailHash(user.email),
  });
  const door = assembleDoor(mineralRows);

  // DEVICES AND ACCESS ARE NOT TWO VIEWS OF ONE THING (2026-08-13). They look
  // adjacent and they act on different objects: this page removes ONE MACHINE'S
  // KEY, the access matrix removes AN ACCOUNT and cascades to every machine that
  // account enrolled. Neither can do the other's job, so neither absorbs the
  // other; what they owe each other is a pointer, because a person who came here
  // to cut somebody off entirely would otherwise remove three machines one at a
  // time and leave the access itself live.
  let main = `<h1>Devices</h1>
<p class="lead">The machines that can open your minerals. A machine stays here until you remove it; signing out of the website does not touch its keys.</p>
<p class="note">To cut off a whole <b>account</b> rather than one machine, use <a href="/app/access">Access</a>: it removes their access and every machine they enrolled with it.</p>`;

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
      const opensLines = mc.opens.map((o) => {
        const cap = o.vault ? 'can open its sealed secrets' : 'cannot open its sealed secrets';
        return `<div class="sub">opens <b>${escapeHtml(o.mineral)}</b> &middot; ${cap}${o.removing ? ' &middot; <b>removal in progress</b>' : ''}</div>`;
      }).join('');
      const seen = mc.last_seen
        ? `<div class="sub">last opened ${renderTime(mc.last_seen)}</div>`
        : '<div class="sub">not seen since it was added</div>';
      const who = mc.mine ? '<div class="sub">you added this machine</div>' : '';
      const buttons = mc.opens.map((o) => (o.removing
        // the mineral has been asked and has not answered yet. Re-asking does
        // nothing, so there is no button to press.
        ? `<span class="act quiet" aria-disabled="true">Removing from ${escapeHtml(o.mineral)}&#8230;</span>`
        : `<form method="POST" action="/api/app/device-remove" style="display:inline;margin-right:.5em"
        onsubmit="return confirm('Remove ${escapeHtml(mc.label)}\\u2019s key from ${escapeHtml(o.mineral)}? The mineral applies this itself, usually within a couple of minutes.')">
        <input type="hidden" name="mineral_id" value="${escapeHtml(o.mineral_id)}">
        <input type="hidden" name="slug" value="${escapeHtml(o.slug)}">
        <button class="act quiet" type="submit">Remove from ${escapeHtml(o.mineral)}</button>
      </form>`)).join('');
      main += `<div class="card">
  <h2>${escapeHtml(mc.label)}</h2>
  ${opensLines}
  ${seen}
  ${who}
  ${mc.added ? `<div class="sub">added ${escapeHtml(mc.added)}</div>` : ''}
  <div style="margin-top:.7em">${buttons}</div>
</div>`;
    }
  } else if (minR.ok) {
    main += `<div class="empty"><b>No machines are enrolled yet.</b>
      <p class="note">A machine appears here once a mineral&#8217;s roster admits its key. Open the mineral from the Crads-AI app on that machine and it enrols itself.</p></div>`;
  }

  // the door's other two sources, named as what they are
  if (door.founders.length || door.support.length) {
    main += '<h1 style="margin-top:1.6em;font-size:1.15em">Other keys that open your minerals</h1>\n<p class="note">Not machines you added, but they open the box, so they belong on this page.</p>';
    for (const f of door.founders) {
      main += `<div class="card">
  <h2>${escapeHtml(f.who)} <span class="chip">first key</span></h2>
  <div class="sub">made when <b>${escapeHtml(f.mineral)}</b> was created, and still opens it</div>
  <div class="sub">removing it is done on the mineral itself, not from here</div>
</div>`;
    }
    for (const s of door.support) {
      main += `<div class="card">
  <h2>Crads support <span class="chip ${s.active ? 'warn' : 'good'}">${s.active ? 'ON' : 'off'}</span></h2>
  <div class="sub">${s.active
    ? `can open <b>${escapeHtml(s.mineral)}</b> until ${renderTime(s.expires_at)}, then stops on its own`
    : `cannot open <b>${escapeHtml(s.mineral)}</b>. Nobody at Crads can get in unless you grant it, and a grant expires by itself.`}</div>
</div>`;
    }
  }

  // sessions that match no enrolled machine: the ephemeral layer, named as such
  if (orphanSessions.length || !payload.sid) {
    main += '<h1 style="margin-top:1.6em;font-size:1.15em">Signed-in sessions</h1>\n<p class="note">Website and app sign-ins. A browser holds a cookie rather than a key, so it cannot say which computer it is on. These expire 60 days after they are last used.</p>';
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
module.exports.assembleDoor = assembleDoor;
