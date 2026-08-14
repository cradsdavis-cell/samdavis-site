'use strict';
// /app/account — who this account is, and everything currently signed in to it.
//
// SESSIONS MOVED HERE (Sam's ruling, 2026-08-13). They used to sit on the
// Devices page next to box keys, which put two different consequences on one
// screen: a session is a cookie that lets you read this website, a key is a
// thing that opens a machine. Signing a browser out costs nothing; removing a
// key locks somebody out of their assistant. They also never joined up — the
// code that tried to match a session to an enrolled machine could not work,
// because no session carries a machine identity, so every session was always
// an "orphan" and the matching code was unreachable. Deleted rather than kept.
//
// Sessions belong with sign-in, and sign-in lives here.
const { requireAuth } = require('../../lib/account');
const { isAdmin, parseSessionFromRequest, verifySession } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, renderTime, escapeHtml } = require('../../lib/appShell');

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;
  const payload = verifySession(parseSessionFromRequest(req)) || {};

  const sessions = await kv.listSessions(user.email).catch(() => []);
  sessions.sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')));

  const created = String(user.created_at || '').slice(0, 10);
  const how = user.signup_source === 'google' ? 'Google' : 'email and password';

  let main = `
<style>
  .sect{margin-top:1.6em;font-size:1.15em}
  .sess{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden;margin:.8em 0}
  .sess .row{padding:.75em 1.1em;border-bottom:1px solid var(--line);display:flex;gap:.8em;align-items:center;flex-wrap:wrap}
  /* NOT .who — the app shell already owns that class for the sidebar's
     "Signed in as" block, border-top and all, and reusing the name pulled a
     stray horizontal rule and 40px of margin into every session row. Found by
     rendering the page; no test would have seen it. */
  .sess .row:last-child{border-bottom:none}
  .sess .sessrow{flex:1 1 16em}
  .sess form{margin:0}
  .sess button{background:none;border:1px solid var(--line);border-radius:8px;padding:.35em .7em;
    color:var(--soft);font:inherit;font-size:.85em;cursor:pointer}
  .sess button:hover{border-color:var(--bad);color:var(--bad)}
</style>
<h1>Account</h1>
<p class="lead">One account. Your minerals, the machines that open them and your billing all hang off it.</p>
<div class="card">
  <h2>${escapeHtml(user.email)}</h2>
  <div class="sub">Signed up with ${escapeHtml(how)}${created ? ` &middot; ${escapeHtml(created)}` : ''}</div>
  <div class="chips">
    ${user.email_verified ? '<span class="chip good">email verified</span>' : '<span class="chip warn">email unverified</span>'}
  </div>
</div>
<div class="card">
  <h2>Password</h2>
  <div class="sub">Changing it signs out every machine, including the desktop app, within the hour.</div>
  <p class="note"><a class="act quiet" href="/account/set-password">Set or change your password</a></p>
</div>`;

  main += `<h2 class="sect">Signed in</h2>
<p class="note">Websites and apps currently signed in to this account. These expire 60 days after they are last used.
A sign-in is not a key: signing one out here does not touch any machine&#8217;s access to your minerals, which lives on <a href="/app/access">Access</a>.</p>`;

  const rows = [];
  // A cookie minted before the session registry existed cannot be listed or
  // revoked individually. Saying so beats leaving the reader to wonder why the
  // browser they are holding is not in the list.
  if (!payload.sid) {
    rows.push(`<div class="row"><div class="sessrow"><b>This browser</b>
      <div class="sub">Signed in before sessions were listed, so it cannot be signed out on its own. Sign out and back in and it appears here.</div></div></div>`);
  }
  for (const s of sessions) {
    const current = s.sid === payload.sid;
    rows.push(`<div class="row">
      <div class="sessrow"><b>${escapeHtml(s.label || 'Unknown sign-in')}</b>${current ? ' <span class="chip good">this browser</span>' : ''}
        <div class="sub">Signed in ${renderTime(s.created_at)} &middot; last used ${renderTime(s.last_seen)}</div></div>
      ${current ? '' : `<form method="POST" action="/api/app/device-revoke">
        <input type="hidden" name="sid" value="${escapeHtml(s.sid)}">
        <button type="submit">Sign out</button>
      </form>`}
    </div>`);
  }
  main += rows.length
    ? `<div class="sess">${rows.join('')}</div>`
    : '<div class="empty"><b>Nothing else is signed in.</b></div>';

  main += `<form method="POST" action="/api/app/device-revoke"
      onsubmit="return confirm('Sign out every session, including this one?')">
  <input type="hidden" name="everywhere" value="1">
  <button class="act quiet" type="submit">Sign out everywhere</button>
</form>
<p class="note">Ends every session within the hour. Machines keep their keys; those are removed on <a href="/app/access">Access</a>.</p>

<div class="card" style="margin-top:1.6em">
  <h2>The desktop app</h2>
  <div class="sub">The app signs in to this same account and stays signed in on that machine for about 60 days. You connect it from the app itself, not from here.</div>
</div>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Account', active: 'account', email: user.email, isAdmin: isAdmin(user.email), main }));
};
