'use strict';
const { parseSessionFromRequest, verifySession, isAdmin,
        shouldRefreshSession, signSession, formatSessionCookie } = require('./auth');

async function requireAuth({ kv, req, res }) {
  const jwt = parseSessionFromRequest(req);
  if (!jwt) { res.redirect(302, '/account/login'); return null; }
  const payload = verifySession(jwt);
  if (!payload) { res.redirect(302, '/account/login'); return null; }
  const user = await kv.getUser(payload.email);
  if (!user) { res.redirect(302, '/account/login'); return null; }
  if ((user.state_version || 1) !== (payload.state_version || 1)) {
    res.redirect(302, '/account/login'); return null;
  }
  // arc A3: a session carrying a sid must still be REGISTERED — that is what
  // makes per-device revoke real, since the JWT itself stays valid to expiry.
  // A sid-less legacy session passes untouched (deploy safety, pinned by test).
  // ownership ruling 5: every account carries a permanent id. Accounts that
  // predate it acquire one here, once, on first load.
  const { ensureAccountId } = require('./accountId');
  await ensureAccountId(kv, user);
  const { sessionWelcome } = require('./sessions');
  const sw = await sessionWelcome({ kv, payload });
  if (!sw.welcome) { res.redirect(302, '/account/login'); return null; }
  // Rolling refresh: re-issue the cookie once past the halfway mark so active
  // users stay signed in indefinitely (no re-login email). Same state_version,
  // same sid — a refresh is the same device, never a new one.
  if (shouldRefreshSession(payload) && res && typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', formatSessionCookie(signSession({
      email: user.email, state_version: user.state_version || 1,
      ...(payload.sid ? { sid: payload.sid } : {}),
    })));
  }
  return user;
}

// Arc A6 (2026-08-10, ruling 2): coaching leaves the NAVIGATION, not the
// internet. crads-ai.com is the product's home now, so the coaching pages stop
// being advertised here — but every one of them keeps answering at its own URL,
// because live clients hold those links, Stripe returns to them and Cal.com
// books through them. This array is the only place the nav is defined, so
// removing an entry here changes nothing about whether the route works;
// tests/coachingUnlisted.test.js pins both halves of that sentence.
//
// Kept: Home (the coaching client's own landing) and Profile (their details).
// Unlisted: Book a session, Sessions, Packs, Subscription — reachable from
// Home's own panels and from the links clients already have.
function renderSidebar({ activeRoute, isAdmin: admin }) {
  const items = [
    { route: 'home', href: '/account/', label: 'Home' },
    { route: 'profile', href: '/account/profile', label: 'Profile' },
  ];
  let html = '<nav class="sidebar-nav">';
  html += '<a href="/" class="sidebar-brand">Sam Davis<span class="accent">.</span><small>← BACK TO SITE</small></a>';
  for (const item of items) {
    const cls = item.route === activeRoute ? 'sidebar-item active' : 'sidebar-item';
    html += `<a href="${item.href}" class="${cls}">${item.label}</a>`;
  }
  if (admin) {
    html += '<div class="sidebar-divider"></div>';
    const cls = activeRoute === 'admin' ? 'sidebar-item active' : 'sidebar-item';
    html += `<a href="/account/admin" class="${cls}">Admin</a>`;
  }
  html += '<form action="/api/auth/logout" method="POST" class="sidebar-logout"><button type="submit" class="sidebar-item-button">Log out</button></form>';
  html += '</nav>';
  return html;
}

async function requireAdmin({ kv, req, res }) {
  const user = await requireAuth({ kv, req, res });
  if (!user) return null;
  if (!isAdmin(user.email)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return user;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderShell({ title, activeRoute, isAdmin: admin, mainContent }) {
  // title is caller-supplied and on admin/client.js is user.name — escape it so a
  // client name like `</title><script>…</script>` can't break out of the <title>
  // element and run script in the admin's session (stored XSS). mainContent is
  // already escaped by each handler; title is the one raw sink.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · crads-ai</title>
  <link rel="stylesheet" href="/lib/site.css">
  <meta name="robots" content="noindex">
</head>
<body class="account-page dashboard">
  <div class="dashboard-layout">
    ${renderSidebar({ activeRoute, isAdmin: admin })}
    <main class="dashboard-main">
      ${mainContent}
    </main>
  </div>
</body>
</html>`;
}

module.exports = { requireAuth, requireAdmin, renderSidebar, renderShell };
