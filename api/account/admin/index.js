'use strict';
const { requireAdmin, renderShell } = require('../../../lib/account');
const { defaultKv } = require('../../../lib/kv');

module.exports = async function handler(req, res) {
  const admin = await requireAdmin({ kv: defaultKv(), req, res });
  if (!admin) return;

  const kv = defaultKv();
  const users = await kv.listUsers();
  users.sort((a, b) => new Date(b.state_updated_at || b.created_at || 0) - new Date(a.state_updated_at || a.created_at || 0));

  const stateFilter = req.query && req.query.state;
  const filtered = stateFilter ? users.filter(u => u.state === stateFilter) : users;

  const rows = filtered.map(u => `
    <tr>
      <td><a href="/account/admin/client?email=${encodeURIComponent(u.email)}">${escapeHTML(u.email)}</a></td>
      <td>${escapeHTML(u.name || '—')}</td>
      <td><span class="state-badge state-${u.state}">${u.state}</span></td>
      <td>${escapeHTML(u.stripe_customer_id || '—')}</td>
      <td>${(u.state_updated_at || '').split('T')[0]}</td>
    </tr>
  `).join('');

  const states = ['onboarding-incomplete','pre-s1','between-s1-s2','between-s2-s3','between-s3-s4','post-s4-decision','retainer-active','graduated','cohort-active'];
  const filterOptions = states.map(s => `<option value="${s}" ${stateFilter === s ? 'selected' : ''}>${s}</option>`).join('');

  const mainContent = `
    <h1 class="serif">Admin — clients</h1>
    <form method="GET" class="admin-filter">
      <label>Filter by state:
        <select name="state">
          <option value="">All</option>
          ${filterOptions}
        </select>
      </label>
      <button type="submit" class="cta-secondary">Apply</button>
    </form>
    <table class="admin-table">
      <thead><tr><th>Email</th><th>Name</th><th>State</th><th>Stripe customer</th><th>Last touched</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No clients.</td></tr>'}</tbody>
    </table>
    <p class="panel-content">${filtered.length} of ${users.length} client${users.length === 1 ? '' : 's'} shown.</p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({ title: 'Admin', activeRoute: 'admin', isAdmin: true, mainContent }));
};

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
