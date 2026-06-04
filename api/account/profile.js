'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const cw = user.onboarding && user.onboarding.context_worksheet;
  const worksheetHtml = cw ? `
    <dl class="worksheet">
      <dt>Business</dt><dd>${escapeHTML(cw.business || '—')}</dd>
      <dt>Current pain</dt><dd>${escapeHTML(cw.current_pain || '—')}</dd>
      <dt>Tools</dt><dd>${(cw.current_tools || []).map(escapeHTML).join(', ') || '—'}</dd>
      <dt>Desired outcome</dt><dd>${escapeHTML(cw.desired_outcome || '—')}</dd>
      <dt>Nervous about</dt><dd>${escapeHTML(cw.nervous_about || '—')}</dd>
      <dt>Technical level</dt><dd>${escapeHTML(cw.technical_level || '—')}</dd>
      <dt>Anything else</dt><dd>${escapeHTML(cw.anything_else || '—')}</dd>
    </dl>
  ` : '<p class="panel-content">Context worksheet not yet filled in.</p>';

  const mainContent = `
    <h1 class="serif">Profile</h1>
    <section class="panel">
      <div class="panel-title">You</div>
      <div class="panel-content">${escapeHTML(user.name || '—')}<br>${escapeHTML(user.email)}</div>
    </section>
    <section class="panel">
      <div class="panel-title">Your context worksheet</div>
      ${worksheetHtml}
      <p class="panel-content"><a href="/account/profile/edit" class="cta-secondary">Edit answers</a></p>
    </section>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Profile', activeRoute: 'profile',
    isAdmin: isAdmin(user.email), mainContent,
  }));
};
