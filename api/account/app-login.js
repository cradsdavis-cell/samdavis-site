'use strict';
// /account/app-login — the desktop app's consent page (T3, 2026-08-10).
// The Crads AI app opens this in the system browser with ?port=<loopback>&
// state=<opaque>. A signed-out visitor bounces through the normal login
// (password / magic link / Google) via requireAuth and lands back here. One
// explicit button then mints the one-time handoff code and returns to the
// app's localhost listener — the consent click is what stops a drive-by page
// from planting tokens on someone's localhost.
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const port = parseInt((req.query || {}).port, 10);
  const state = String((req.query || {}).state || '');
  const okParams = Number.isInteger(port) && port >= 1024 && port <= 65535
    && state && state.length <= 128 && !/[^A-Za-z0-9_-]/.test(state);

  const mainContent = okParams ? `
    <h1 class="serif">Connect the Crads AI app</h1>
    <section class="panel">
      <div class="panel-title">One click</div>
      <div class="panel-content">
        <p>The Crads AI app on this computer wants to sign in as <b>${String(user.email).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</b>.</p>
        <p>It stays signed in on this machine for about 60 days. Changing your password signs out every machine.</p>
        <button id="connectBtn" class="cta">Connect the app</button>
        <p id="handoffMsg" class="panel-content" style="display:none"></p>
      </div>
    </section>
    <script>
      document.getElementById('connectBtn').addEventListener('click', async () => {
        const btn = document.getElementById('connectBtn');
        const msg = document.getElementById('handoffMsg');
        btn.disabled = true;
        try {
          const r = await fetch('/api/auth/app-handoff', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ port: ${port}, state: ${JSON.stringify(state)} }),
          });
          const j = await r.json();
          if (j && j.ok && j.redirect) { location.href = j.redirect; return; }
          msg.textContent = 'Could not connect: ' + ((j && j.error) || 'unknown error') + '. Close this tab and try again from the app.';
          msg.style.display = ''; btn.disabled = false;
        } catch (e) {
          msg.textContent = 'Could not reach the site. Check your connection and press the button again.';
          msg.style.display = ''; btn.disabled = false;
        }
      });
    </script>
  ` : `
    <h1 class="serif">Connect the Crads AI app</h1>
    <section class="panel">
      <div class="panel-content">
        <p>This page only works when the Crads AI app opens it. Open the app and press <b>Sign in to Crads</b> there.</p>
      </div>
    </section>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Connect the app', activeRoute: 'app-login',
    isAdmin: isAdmin(user.email), mainContent,
  }));
};
