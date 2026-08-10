'use strict';
// /account/app-login — the desktop app's consent page (T3, 2026-08-10;
// restyled 2026-08-10 per Sam's account-arc grilling, ruling: account surfaces
// speak the Crads-AI APP's design language, standalone, never the site shell).
// The app opens this in the system browser with ?port=<loopback>&state=<opaque>.
// A signed-out visitor bounces through the normal login (password / magic link
// / Google) via requireAuth and lands back here. One explicit button then
// mints the one-time handoff code and returns to the app's localhost listener —
// the consent click is what stops a drive-by page from planting tokens on
// someone's localhost.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The app's own palette (wizard/panel/door.html tokens), both themes.
function page({ body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect this computer · Crads-AI</title>
<style>
  :root{
    --paper:#F7F5EF; --card:#FFFFFF; --line:#E3E1D6;
    --ink:#1F2D24; --soft:#5C6B60; --faint:#8A968C;
    --accent:#A4582C; --accent-hi:#C2703D; --on-accent:#FFFFFF;
  }
  @media (prefers-color-scheme: dark){
    :root{
      --paper:#161A16; --card:#1D231E; --line:#2E362F;
      --ink:#E8EAE4; --soft:#9AA79C; --faint:#6B776D;
      --accent:#C2703D; --accent-hi:#D98A55; --on-accent:#161A16;
    }
  }
  *{box-sizing:border-box;margin:0}
  body{background:var(--paper);color:var(--ink);
    font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;
    min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5em}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;
    max-width:26.5em;width:100%;padding:2em 2.1em 1.9em}
  .mark{font-weight:700;font-size:1.05em;letter-spacing:.01em}
  .mark i{font-style:normal;color:var(--accent)}
  .tag{font:600 .68em/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-top:.45em}
  h1{font-size:1.32em;line-height:1.25;margin:1.15em 0 .55em}
  p{color:var(--soft);margin:.55em 0}
  p b{color:var(--ink)}
  .act{display:block;width:100%;margin-top:1.25em;padding:.78em 1em;border-radius:10px;
    border:1px solid var(--accent);background:var(--accent);color:var(--on-accent);
    font:600 1em system-ui,sans-serif;cursor:pointer}
  .act:hover{background:var(--accent-hi);border-color:var(--accent-hi)}
  .act[disabled]{opacity:.55;cursor:default}
  .sub{margin-top:1.1em;font-size:.88em;color:var(--faint);text-align:center}
  .sub button{background:none;border:none;padding:0;color:var(--faint);
    font:inherit;text-decoration:underline;cursor:pointer}
  .msg{display:none;margin-top:1em;font-size:.92em;color:var(--accent)}
</style>
</head>
<body>
<div class="card">
  <div class="mark">crads<i>-ai</i></div>
  <div class="tag">Your private assistant</div>
  ${body}
</div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const port = parseInt((req.query || {}).port, 10);
  const state = String((req.query || {}).state || '');
  const okParams = Number.isInteger(port) && port >= 1024 && port <= 65535
    && state && state.length <= 128 && !/[^A-Za-z0-9_-]/.test(state);

  const body = okParams ? `
  <h1>Connect this computer</h1>
  <p>The Crads-AI app on this computer wants to sign in as <b>${esc(user.email)}</b>.</p>
  <p>It stays signed in here for about 60 days. Changing your password signs out every machine.</p>
  <button id="connectBtn" class="act">Connect the app</button>
  <p id="handoffMsg" class="msg"></p>
  <div class="sub">Not you?
    <form action="/api/auth/logout" method="POST" style="display:inline"><button type="submit">Use a different account</button></form>
  </div>
  <script>
    document.getElementById('connectBtn').addEventListener('click', async () => {
      const btn = document.getElementById('connectBtn');
      const msg = document.getElementById('handoffMsg');
      btn.disabled = true; btn.textContent = 'Connecting…';
      try {
        const r = await fetch('/api/auth/app-handoff', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ port: ${port}, state: ${JSON.stringify(state)} }),
        });
        const j = await r.json();
        if (j && j.ok && j.redirect) {
          btn.textContent = 'Connected ✓';
          location.href = j.redirect; return;
        }
        msg.textContent = 'Could not connect: ' + ((j && j.error) || 'unknown error') + '. Close this tab and try again from the app.';
        msg.style.display = 'block'; btn.disabled = false; btn.textContent = 'Connect the app';
      } catch (e) {
        msg.textContent = 'Could not reach the site. Check your connection and press the button again.';
        msg.style.display = 'block'; btn.disabled = false; btn.textContent = 'Connect the app';
      }
    });
  </script>` : `
  <h1>Connect this computer</h1>
  <p>This page only works when the Crads-AI app opens it. Open the app and press <b>Sign in to Crads-AI</b> there.</p>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(page({ body }));
};
