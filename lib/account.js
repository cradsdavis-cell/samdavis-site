'use strict';
const { parseSessionFromRequest, verifySession, isAdmin } = require('./auth');

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
  return user;
}

function renderSidebar({ activeRoute, isAdmin: admin }) {
  const items = [
    { route: 'home', href: '/account/', label: 'Home' },
    { route: 'sessions', href: '/account/sessions', label: 'Sessions' },
    { route: 'packs', href: '/account/packs', label: 'Packs' },
    { route: 'subscription', href: '/account/subscription', label: 'Subscription' },
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

function renderShell({ title, activeRoute, isAdmin: admin, mainContent }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · crads-ai</title>
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
