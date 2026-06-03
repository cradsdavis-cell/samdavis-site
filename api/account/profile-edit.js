'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const cw = (user.onboarding && user.onboarding.context_worksheet) || {};
  const v = (k) => escapeAttr(cw[k] || '');

  const mainContent = `
    <h1 class="serif">Edit profile</h1>
    <form method="POST" action="/api/account/profile-update">
      <label>Your name<br><input type="text" name="name" value="${escapeAttr(user.name || '')}"></label>

      <h3>Context worksheet</h3>
      <label>What's your business?<br><textarea name="business" rows="2">${v('business')}</textarea></label>
      <label>What's the workflow that's eating your week?<br><textarea name="current_pain" rows="3">${v('current_pain')}</textarea></label>
      <label>What tools do you use?<br>
        ${['gmail','slack','notion','asana','google-calendar','other'].map(t => `
          <label class="cw-checkbox"><input type="checkbox" name="current_tools" value="${t}" ${(cw.current_tools || []).includes(t) ? 'checked' : ''}> ${t.replace('-', ' ')}</label>
        `).join('')}
      </label>
      <label>What would feel different after our 4 sessions?<br><textarea name="desired_outcome" rows="3">${v('desired_outcome')}</textarea></label>
      <label>Anything you're nervous about?<br><textarea name="nervous_about" rows="2">${v('nervous_about')}</textarea></label>
      <label>How technical are you?<br>
        ${['very','somewhat','not-at-all','dont-know'].map(t => `
          <label class="cw-radio"><input type="radio" name="technical_level" value="${t}" ${cw.technical_level === t ? 'checked' : ''}> ${t.replace('-', ' ')}</label>
        `).join('')}
      </label>
      <label>Anything else?<br><textarea name="anything_else" rows="2">${v('anything_else')}</textarea></label>

      <button type="submit" class="cta">Save changes</button>
      <a href="/account/profile" class="cta-secondary">Cancel</a>
    </form>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({ title: 'Edit profile', activeRoute: 'profile', isAdmin: isAdmin(user.email), mainContent }));
};
