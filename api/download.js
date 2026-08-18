// api/download.js - serves /download behind the beta password gate.
//
// Routes (wired in vercel.json):
//   GET  /download          unlocked -> the page; locked -> the password form
//   POST /download          correct password -> cookie + redirect back to /download
//   GET  /download/windows  unlocked -> 302 to the exe;  locked -> back to the form
//   GET  /download/mac      unlocked -> 302 to the zip;  locked -> back to the form
//
// The page cannot be a static file under download/, because Vercel's static
// layer answers before any function runs and the gate would never see it.
'use strict';

const { PAGE_HTML } = require('../lib/downloadPage');
const { passwordMatches, isUnlocked, unlockCookie, secret } = require('../lib/downloadGate');

const REL = 'https://github.com/cradsdavis-cell/crads-ai-app/releases/download/wizard-app';
const ASSETS = { windows: `${REL}/crads-ai.exe`, mac: `${REL}/crads-ai-mac.zip` };

// `error` is fixed copy chosen in this file, never anything the visitor typed:
// the attempted password is deliberately not echoed back, so there is no
// untrusted string reaching this template. If that ever changes, escape it here.
function formHtml({ error = '', notConfigured = false } = {}) {
  const body = notConfigured
    ? `<p class="lede">This page is not available right now.</p>
       <p class="hint">Nothing is wrong on your end. Reply to whoever sent you the link and let them know.</p>`
    : `<p class="lede">This is a private beta. Enter the password you were given.</p>
       <form method="POST" action="/download" autocomplete="off">
         <label for="pw">Password</label>
         <input id="pw" name="password" type="password" autofocus autocapitalize="off"
                autocorrect="off" spellcheck="false" required>
         ${error ? `<p class="err">${error}</p>` : ''}
         <button class="btn" type="submit">Continue</button>
       </form>
       <p class="hint">Don't have one? Reply to whoever sent you here and ask.</p>`;
  return `<!doctype html>
<html lang="en" >
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Crads-AI</title>
<style>
  :root{
    --paper:#F7F5EF; --card:#FFFFFF; --line:#E3E1D6; --line-2:#D3D1C4;
    --ink:#1F2D24; --soft-2:#4F5D53; --faint:#8A968C;
    --accent:#A4582C; --accent-hi:#C2703D; --on-accent:#FFFFFF; --bad:#B3402E;
    --focus:0 0 0 2px #F7F5EF, 0 0 0 4px #A4582C;
    --shadow-1:0 1px 2px rgba(31,45,36,.05),0 4px 16px -8px rgba(31,45,36,.10);
    --sans:'Inter',system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    --serif:"Palatino Linotype",Palatino,Georgia,serif;
    color-scheme:light;
  }
  @media (prefers-color-scheme:dark){
    :root{
      --paper:#161A16; --card:#262E25; --line:#2E362F; --line-2:#3B453C;
      --ink:#E9ECE6; --soft-2:#ABB5AC; --faint:#6F7B70;
      --accent:#D08A52; --accent-hi:#DEA06C; --on-accent:#1C1108; --bad:#D9705C;
      --focus:0 0 0 2px #161A16, 0 0 0 4px #D08A52;
      --shadow-1:0 1px 2px rgba(0,0,0,.25),0 4px 16px -8px rgba(0,0,0,.4);
      color-scheme:dark;
    }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14px;
       line-height:1.55;-webkit-font-smoothing:antialiased;display:flex;min-height:100vh;
       align-items:center;justify-content:center;padding:24px}
  .wrap{max-width:380px;width:100%}
  .brand{display:flex;align-items:center;gap:12px;margin:0 0 24px}
  .brand svg{width:36px;height:36px;flex:none}
  .brand svg rect{stroke:var(--line-2);stroke-width:1}
  .wordmark{font-family:var(--serif);font-size:18px;color:var(--ink)}
  .tag{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
       color:var(--soft-2);margin-top:2px;font-weight:500}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;
        box-shadow:var(--shadow-1)}
  .lede{margin:0 0 16px;color:var(--soft-2)}
  label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}
  input{width:100%;padding:11px 12px;border-radius:8px;border:1px solid var(--line-2);
        background:var(--card);color:var(--ink);font-size:15px;font-family:inherit}
  input:focus-visible{outline:none;border-color:var(--accent);box-shadow:var(--focus)}
  .btn{width:100%;margin-top:14px;background:var(--accent);color:var(--on-accent);
       border:1px solid var(--accent);border-radius:10px;padding:12px 20px;font-size:14px;
       font-weight:650;font-family:inherit;cursor:pointer}
  .btn:hover{background:var(--accent-hi);border-color:var(--accent-hi)}
  .btn:focus-visible{outline:none;box-shadow:var(--focus)}
  .err{color:color-mix(in srgb,var(--bad) 75%,var(--ink));font-weight:500;font-size:13px;margin:12px 0 0}
  .hint{font-size:12.5px;color:var(--soft-2);margin:16px 0 0}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#1F2D24"/>
      <path d="M47.63 43.15 A19.2 19.2 0 1 1 47.63 20.85" fill="none" stroke="#C2703D" stroke-width="5.44" stroke-linecap="round"/>
      <circle cx="51.2" cy="32" r="5.63" fill="#7FA884"/>
    </svg>
    <div><div class="wordmark">Crads-AI</div><div class="tag">Your private assistant</div></div>
  </div>
  <div class="card">${body}</div>
</div>
</body>
</html>`;
}

// Vercel parses urlencoded bodies, but a raw string can still arrive; handle both
// rather than trusting one shape.
function readPassword(req) {
  const b = req && req.body;
  if (b && typeof b === 'object' && 'password' in b) return b.password;
  if (typeof b === 'string') {
    const m = b.match(/(?:^|&)password=([^&]*)/);
    if (m) { try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { return m[1]; } }
  }
  return '';
}

// Never cached: a shared cache must not hand the unlocked page to the next visitor.
function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

module.exports = async (req, res) => {
  noStore(res);
  const asset = String((req.query && req.query.asset) || '').toLowerCase();

  if (!secret()) {
    // Fail closed. A missing env var must never publish the page by accident.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(503).send(formHtml({ notConfigured: true }));
    return;
  }

  if (req.method === 'POST') {
    if (passwordMatches(readPassword(req))) {
      res.setHeader('Set-Cookie', unlockCookie());
      res.redirect(303, '/download');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(401).send(formHtml({ error: "That password didn't work. Check for a stray space and try again." }));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.status(405).end();
    return;
  }

  const unlocked = isUnlocked(req);

  if (asset) {
    if (!ASSETS[asset]) { res.status(404).end(); return; }
    // Locked: send them to the form rather than 404ing, so a shared deep link
    // still lands somewhere they can act on.
    res.redirect(302, unlocked ? ASSETS[asset] : '/download');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(unlocked ? 200 : 401).send(unlocked ? PAGE_HTML : formHtml());
};
