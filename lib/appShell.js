'use strict';
// lib/appShell.js — the chrome for crads-ai.com/app (arc A, 2026-08-10).
//
// This is NOT lib/account.js's renderShell. That shell is the coaching
// business's: its sidebar says Book a session / Packs / Subscription and it
// loads /lib/site.css. Sam pressed "Sign in" in the Crads-AI app, landed in
// that shell, and said the account was wearing another business's clothes —
// which is ruling 1 of the account arc: account surfaces are PRODUCT surfaces
// and speak the app's design language, standalone.
//
// So this file owns the app's own tokens (the same set api/account/app-login.js
// uses, which came from wizard/panel/door.html), both themes, and a nav of the
// four things an account holds: Minerals, Devices, Billing, Account.
//
// Every /api/app/* handler renders through here. tests/appShell.test.js pins
// that none of them reaches for renderShell, because the whole point is that
// these two shells never converge again.

const NAV = [
  { route: 'minerals', href: '/app/minerals', label: 'Minerals' },
  { route: 'devices', href: '/app/devices', label: 'Devices' },
  { route: 'activity', href: '/app/activity', label: 'Activity' },
  { route: 'billing', href: '/app/billing', label: 'Billing' },
  { route: 'account', href: '/app/account', label: 'Account' },
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The app's palette. Kept literal rather than imported: this file is served by
// a serverless function with no bundler, and the app itself carries the same
// values inline for exactly that reason.
const STYLE = `
  :root{
    --paper:#F7F5EF; --card:#FFFFFF; --card-2:#F1EFE7; --line:#E3E1D6;
    --ink:#1F2D24; --soft:#5C6B60; --faint:#8A968C;
    --accent:#A4582C; --accent-hi:#C2703D; --on-accent:#FFFFFF;
    --good:#2F6B45; --warn:#8A5A20; --bad:#8C3A2E;
  }
  @media (prefers-color-scheme: dark){
    :root{
      --paper:#161A16; --card:#1D231E; --card-2:#232A24; --line:#2E362F;
      --ink:#E8EAE4; --soft:#9AA79C; --faint:#6B776D;
      --accent:#C2703D; --accent-hi:#D98A55; --on-accent:#161A16;
      --good:#6FAE84; --warn:#C99A55; --bad:#D08A7D;
    }
  }
  *{box-sizing:border-box;margin:0}
  body{background:var(--paper);color:var(--ink);
    font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh}
  a{color:var(--accent)}
  .wrap{display:flex;min-height:100vh;align-items:stretch}
  .side{flex:0 0 232px;border-right:1px solid var(--line);padding:1.6em 1.1em;background:var(--card)}
  .mark{font-weight:700;font-size:1.05em;letter-spacing:.01em;display:block;color:var(--ink);text-decoration:none}
  .mark i{font-style:normal;color:var(--accent)}
  .tag{font:600 .66em/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:.45em 0 1.8em}
  .nav{display:flex;flex-direction:column;gap:.15em}
  .nav a{display:block;padding:.5em .7em;border-radius:8px;color:var(--soft);
    text-decoration:none;font-size:.97em}
  .nav a:hover{background:var(--card-2);color:var(--ink)}
  .nav a.on{background:var(--card-2);color:var(--ink);font-weight:600}
  .who{margin-top:2em;padding-top:1em;border-top:1px solid var(--line);font-size:.85em;color:var(--faint);word-break:break-all}
  .who b{display:block;color:var(--soft);font-weight:600;margin-bottom:.5em}
  .who form{margin-top:.7em}
  .who button{background:none;border:none;padding:0;color:var(--faint);
    font:inherit;text-decoration:underline;cursor:pointer}
  main{flex:1 1 auto;padding:2.2em 2.4em;max-width:60em}
  h1{font-size:1.5em;line-height:1.2;margin-bottom:.25em}
  .lead{color:var(--soft);margin-bottom:1.6em}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:1.1em 1.2em;margin-bottom:.9em}
  .card h2{font-size:1.05em;margin-bottom:.2em}
  .card .sub{color:var(--soft);font-size:.92em}
  .chips{display:flex;flex-wrap:wrap;gap:.4em;margin:.55em 0 0}
  .chip{font:600 .7em/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;
    text-transform:uppercase;padding:.35em .6em;border-radius:999px;
    background:var(--card-2);color:var(--soft);border:1px solid var(--line)}
  .chip.good{color:var(--good)} .chip.warn{color:var(--warn)} .chip.bad{color:var(--bad)}
  .note{color:var(--soft);font-size:.93em;margin-top:.5em}
  .empty{border:1px dashed var(--line);border-radius:12px;padding:1.6em 1.3em;color:var(--soft)}
  .problem{border:1px solid var(--bad);border-radius:12px;padding:1.1em 1.2em;color:var(--bad);margin-bottom:.9em}
  .act{display:inline-block;padding:.6em .95em;border-radius:9px;border:1px solid var(--accent);
    background:var(--accent);color:var(--on-accent);font:600 .95em system-ui,sans-serif;
    cursor:pointer;text-decoration:none}
  .act.quiet{background:none;color:var(--accent)}
  .act:hover{background:var(--accent-hi);border-color:var(--accent-hi);color:var(--on-accent)}
  time[data-iso]{font-variant-numeric:tabular-nums}
  @media (max-width:720px){
    .wrap{flex-direction:column}
    .side{flex:none;border-right:none;border-bottom:1px solid var(--line);padding:1.1em}
    .nav{flex-direction:row;flex-wrap:wrap}
    main{padding:1.4em 1.1em}
  }
`;

function renderAppNav(active, isAdmin) {
  let html = '<nav class="nav">';
  const items = isAdmin ? [...NAV, { route: 'admin', href: '/app/admin', label: 'Admin' }] : NAV;
  for (const item of items) {
    html += `<a href="${item.href}" class="${item.route === active ? 'on' : ''}">${item.label}</a>`;
  }
  return html + '</nav>';
}

/**
 * The whole page. `main` is trusted (each handler escapes its own data);
 * `title` and `email` are escaped here, the same rule renderShell follows.
 */
function renderAppShell({ title, active, email, main, isAdmin = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Crads-AI</title>
<meta name="robots" content="noindex">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <aside class="side">
    <a href="/app/minerals" class="mark">crads<i>-ai</i></a>
    <div class="tag">Your account</div>
    ${renderAppNav(active, isAdmin)}
    <div class="who">
      <b>Signed in as</b>${escapeHtml(email || '')}
      <form action="/api/auth/logout" method="POST"><button type="submit">Sign out</button></form>
    </div>
  </aside>
  <main>
${main}
  </main>
</div>
<script>
  // Times are stored and rendered in UTC. Shown raw they read as the wrong
  // time of day for everyone off UTC (an 18:39 AEST sign-in displayed as
  // "08:39"), so each <time data-iso> is rewritten to the reader's own clock.
  // The server text stays valid if this never runs: it is labelled UTC.
  (function () {
    var f;
    try { f = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return; }
    var els = document.querySelectorAll('time[data-iso]');
    for (var i = 0; i < els.length; i++) {
      var d = new Date(els[i].getAttribute('data-iso'));
      if (!isNaN(d)) { els[i].textContent = f.format(d); els[i].title = els[i].getAttribute('data-iso'); }
    }
  })();
</script>
</body>
</html>`;
}

/**
 * A timestamp the reader's browser localises. Falls back to the UTC text,
 * explicitly labelled, so the server-rendered page is never ambiguous.
 */
function renderTime(iso) {
  if (!iso) return 'unknown';
  const utc = String(iso).replace('T', ' ').slice(0, 16) + ' UTC';
  return `<time data-iso="${escapeHtml(iso)}">${escapeHtml(utc)}</time>`;
}

module.exports = { renderAppShell, renderAppNav, renderTime, escapeHtml, NAV };
