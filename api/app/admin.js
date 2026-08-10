'use strict';
// /app/admin — the operator's universal view (V3, Sam's ask 2026-08-10 after
// the first live account walk): every mineral the directory mirrors, every
// legacy self-registration, every org route, and every ACCOUNT on this site.
//
// Two different sources, honestly labelled: minerals come from the directory
// (via an admin-scoped token the worker double-checks against the operator's
// email hash), accounts come from this site's own KV. Neither pretends to be
// the other; a mineral the directory has never heard of will not appear, and
// the page says so.
//
// A non-operator gets 404, not 403: this page's existence is nobody else's
// business.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { isAdmin } = require('../../lib/auth');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');

const fmtDate = (v) => {
  const n = typeof v === 'number' ? v : Date.parse(v || '');
  return Number.isFinite(n) ? `<time data-iso="${new Date(n).toISOString()}">${new Date(n).toISOString().slice(0, 10)}</time>` : '';
};

function holderWords(h) {
  if (!h) return 'unclaimed';
  if (h.kind === 'org') return `the rock <b>${escapeHtml(h.org || '?')}</b>`;
  return `an account (${escapeHtml(h.account_id ? h.account_id.slice(0, 12) + '…' : 'by email hash')})`;
}

function mineralsTable(minerals) {
  if (!minerals.length) return '<p class="note">The directory mirrors no minerals yet.</p>';
  const rows = minerals.map((m) => `<tr>
    <td><b>${escapeHtml(m.label || m.host || '(unnamed)')}</b><div class="sub">${escapeHtml(m.host || '')}</div></td>
    <td>${escapeHtml(m.tier || '')}</td>
    <td>${escapeHtml(m.anchor || '')}</td>
    <td>${holderWords(m.holder)}</td>
    <td>${(m.access || []).length} grant${(m.access || []).length === 1 ? '' : 's'}</td>
    <td class="sub">${escapeHtml((m.mineral_id || '').slice(0, 16))}…</td>
    <td>${fmtDate(m.updated)}</td>
  </tr>`).join('');
  return `<div class="tablewrap"><table>
    <thead><tr><th>Mineral</th><th>Tier</th><th>Anchor</th><th>Held by</th><th>Access</th><th>Serial</th><th>Updated</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function boxesTable(boxes) {
  if (!boxes.length) return '';
  const rows = boxes.map((b) => `<tr>
    <td><b>${escapeHtml(b.label || b.host || '')}</b><div class="sub">${escapeHtml(b.host || '')}</div></td>
    <td class="sub">${escapeHtml((b.owner_e || '').slice(0, 12))}…</td>
    <td>${fmtDate(b.updated)}</td>
  </tr>`).join('');
  return `<h2 class="sect">Legacy self-registrations</h2>
  <p class="note">Claims by machines holding a box token, kept until every mineral carries a serial. Not proof of ownership.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Box</th><th>Owner hash</th><th>Updated</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function accountsTable(users) {
  if (!users.length) return '<p class="note">No accounts.</p>';
  const rows = users
    .slice()
    .sort((a, b) => String(a.email).localeCompare(String(b.email)))
    .map((u) => `<tr>
      <td><b>${escapeHtml(u.email || '')}</b></td>
      <td class="sub">${escapeHtml(u.id || 'no id yet')}</td>
      <td>${escapeHtml(u.name || '')}</td>
      <td>${u.password_hash ? 'password' : ''}${u.password_hash && u.google_sub ? ' + ' : ''}${u.google_sub ? 'google' : ''}${!u.password_hash && !u.google_sub ? 'magic link' : ''}</td>
      <td>${fmtDate(u.created_at || u.created)}</td>
      <td>${escapeHtml(String(u.state_version || 1))}</td>
    </tr>`).join('');
  return `<div class="tablewrap"><table>
    <thead><tr><th>Email</th><th>Account id</th><th>Name</th><th>Signs in with</th><th>Created</th><th>State v</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;
  if (!isAdmin(user.email)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send('Not found');
  }

  const [dirR, users] = await Promise.all([
    directoryFor(user).adminAll().catch((e) => ({ ok: false, reason: String(e && e.message || e) })),
    kv.listUsers().catch(() => []),
  ]);

  let main = `<h1>Admin</h1>
<p class="lead">Every account on this site, and every mineral the directory mirrors. Operator only.</p>
<style>
  .tablewrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;margin:.8em 0 1.4em}
  table{border-collapse:collapse;width:100%;font-size:.92em}
  th{text-align:left;padding:.55em .8em;border-bottom:1px solid var(--line);color:var(--soft);font-weight:600;white-space:nowrap}
  td{padding:.55em .8em;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:none}
  .sect{margin-top:1.2em;font-size:1.05em}
</style>
<h2 class="sect">Accounts (${users.length})</h2>
${accountsTable(users)}`;

  if (dirR.ok) {
    main += `<h2 class="sect">Minerals (${dirR.minerals.length})</h2>
${mineralsTable(dirR.minerals)}
${boxesTable(dirR.boxes)}
<h2 class="sect">Org routes (${dirR.orgs.length})</h2>
<p class="note">${dirR.orgs.length ? dirR.orgs.map((o) => escapeHtml(o)).join(' &middot; ') : 'none'}</p>`;
  } else {
    main += `<div class="problem"><b>The directory could not be read.</b>
      <div class="note">${escapeHtml(dirR.reason)}. Accounts above are this site's own and are complete; the mineral view is missing, not empty.</div></div>`;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Admin', active: 'admin', email: user.email, isAdmin: true, main }));
};
