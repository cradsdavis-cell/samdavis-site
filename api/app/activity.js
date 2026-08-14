'use strict';
// /app/activity — Recent changes (rebuilt 2026-08-13).
//
// WHAT WAS WRONG WITH IT. It read exactly one source, /rock-tie-notices, which
// is a 30-day feed of "a rock ended your tie". For an account that has not been
// thrown out of anything, that is empty by construction, so a page titled
// Activity said "Nothing recent" to accounts with months of history. Meanwhile
// the directory has kept an append-only event log with an 800-DAY life since the
// Mountain model landed on 2026-08-04, and nothing on this site read a line of
// it: the only reader was /events, which is operator-scoped and returns the
// whole platform.
//
// WHAT IT IS NOW. Sam's ruling (grill of 2026-08-13): persistence means the page
// never lies, not that it never forgets, so this is "recent changes" over a
// short window rather than an archive. The window is 30 days by default and the
// page says so, because a feed that silently truncates is a feed that lies by
// omission.
//
// Tie endings still ride, folded in rather than replaced: they carry a REASON,
// which the event log does not, and a reason is the most useful thing on the
// page when it applies.
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, renderTime, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');
const { holderIndex, hashEmail, eventWords } = require('../../lib/mineralView');

const WINDOW_DAYS = 30;

const STYLE = `
  .feed{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden}
  .feed .row{padding:.8em 1.1em;border-bottom:1px solid var(--line)}
  .feed .row:last-child{border-bottom:none}
  .feed .row b{font-weight:600}
  .feed .when{color:var(--faint);font-size:.86em}
  .daymark{padding:.5em 1.1em;background:var(--card-2);color:var(--soft);
    font:600 .72em/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase}
`;

/**
 * Merge the two feeds into one dated list. Both carry `at` in ms, so the sort is
 * honest across sources; the source is kept on each row so a reader can tell a
 * reason-bearing notice from a log line.
 */
function assembleFeed({ events = [], notices = [], byHash, me, names = new Map() }) {
  const rows = [];
  for (const e of events) {
    // The log carries HANDLES (keith, test-org-4) because that is what a wire
    // format should carry. Every other page in the app says "Keith" and "Test
    // Org 4", so a feed that says the handle reads like a different product's
    // logs pasted in. The minerals list is already loaded; use it.
    const named = { ...e };
    for (const k of ['org', 'slug', 'rock', 'pebble']) {
      if (named[k] && names.has(String(named[k]).toLowerCase())) named[`${k}_display`] = names.get(String(named[k]).toLowerCase());
    }
    if (named.org_display) named.org = named.org_display;
    if (named.slug_display) named.slug = named.slug_display;
    if (named.rock_display) named.rock = named.rock_display;
    if (named.pebble_display) named.pebble = named.pebble_display;
    // Whose event it is, where the log recorded a person. Resolving it here
    // rather than in the words function keeps the vocabulary file free of any
    // knowledge of accounts.
    let actor = '';
    if (e.e) {
      if (e.e === me.hash) actor = 'you';
      else {
        const hit = byHash.get(String(e.e));
        actor = hit ? hit.email : '';
      }
    }
    rows.push({ at: e.at || 0, title: eventWords(named), actor, reason: '', source: 'log' });
  }
  for (const n of notices) {
    rows.push({
      at: n.at || 0,
      title: `Your ${n.tie === 'anchored' ? 'anchor' : 'membership'} at ${n.org_display || n.org} ended`,
      actor: '',
      reason: n.reason && !/^no reason$/i.test(String(n.reason).trim()) ? String(n.reason) : '',
      source: 'notice',
    });
  }
  return rows.sort((a, b) => (b.at || 0) - (a.at || 0));
}

function renderFeed(rows) {
  let html = '<div class="feed">';
  let day = '';
  for (const r of rows) {
    const iso = r.at ? new Date(r.at).toISOString() : '';
    const d = iso.slice(0, 10);
    if (d && d !== day) { day = d; html += `<div class="daymark">${escapeHtml(d)}</div>`; }
    const who = r.actor ? ` &middot; ${escapeHtml(r.actor)}` : '';
    html += `<div class="row">
      <b>${escapeHtml(r.title)}</b>${who}
      <div class="when">${iso ? renderTime(iso) : 'no time recorded'}</div>
      ${r.reason ? `<div class="sub">${escapeHtml(r.reason)}</div>` : ''}
    </div>`;
  }
  return html + '</div>';
}

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;

  const dir = directoryFor(user);
  const ask = (name, ...args) => (typeof dir[name] === 'function'
    ? dir[name](...args).catch((e) => ({ ok: false, reason: String(e && e.message || e) }))
    : Promise.resolve({ ok: false, reason: `This page cannot read ${name} yet` }));
  const [evR, notR, users, minR] = await Promise.all([
    ask('events', WINDOW_DAYS), ask('notices'), kv.listUsers().catch(() => []), ask('minerals'),
  ]);
  // handle -> display name, so the feed speaks the same language as every other
  // page. A failed minerals read costs the names and nothing else, which is why
  // it is not in the failure count below.
  const names = new Map();
  for (const m of (minR.ok ? minR.minerals : [])) {
    const handle = String(m.host || '').split('.')[0].toLowerCase();
    if (handle && m.label) names.set(handle, m.label);
  }

  let main = `<style>${STYLE}</style>
<h1>Recent changes</h1>
<p class="lead">What has happened around this account&#8217;s minerals in the last ${WINDOW_DAYS} days. Older changes are not shown here.</p>`;

  // A page built from two feeds must say which one failed. Rendering a partial
  // feed as though it were the whole one is the exact shape of lie this rebuild
  // exists to stop.
  const failed = [evR, notR].filter((r) => !r.ok);
  if (failed.length === 2) {
    main += `<div class="problem"><b>Could not read your recent changes just now.</b>
      <div class="note">${escapeHtml(failed[0].reason)}. Nothing has been lost; this page could not ask.</div></div>`;
  } else {
    if (failed.length) {
      main += `<div class="problem"><b>Part of this page could not load.</b>
        <div class="note">${escapeHtml(failed[0].reason)}. What is shown below is real, but it may be incomplete.</div></div>`;
    }
    const rows = assembleFeed({
      events: evR.ok ? evR.events : [],
      notices: notR.ok ? notR.notices : [],
      byHash: holderIndex(users),
      me: { hash: hashEmail(user.email) },
      names,
    });
    main += rows.length
      ? renderFeed(rows)
      : `<div class="empty"><b>Nothing in the last ${WINDOW_DAYS} days.</b>
         <p class="note">Ties, invitations, promotions and builds appear here as they happen.
         An empty list here means quiet, not missing: this account has minerals, they simply have not changed lately.</p></div>`;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Recent changes', active: 'activity', email: user.email, isAdmin: isAdmin(user.email), main }));
};
module.exports.assembleFeed = assembleFeed;
