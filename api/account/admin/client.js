'use strict';
const { requireAdmin, renderShell } = require('../../../lib/account');
const { defaultKv } = require('../../../lib/kv');
const { computeBalance, engagementBalance } = require('../../../lib/sessionBalance');

const VALID_NEXT_STATES = {
  'onboarding-incomplete': [], // client-driven only
  'pre-s1': ['between-s1-s2'],
  'between-s1-s2': ['between-s2-s3'],
  'between-s2-s3': ['between-s3-s4'],
  'between-s3-s4': ['post-s4-decision'],
  'post-s4-decision': ['retainer-active', 'graduated'],
  'retainer-active': [],
  'graduated': [],
};

module.exports = async function handler(req, res) {
  const admin = await requireAdmin({ kv: defaultKv(), req, res });
  if (!admin) return;

  const targetEmail = req.query && req.query.email;
  if (!targetEmail) return res.redirect(302, '/account/admin');

  const kv = defaultKv();
  const user = await kv.getUser(targetEmail);
  if (!user) {
    return res.status(404).send(renderShell({
      title: 'Client not found', activeRoute: 'admin', isAdmin: true,
      mainContent: `<h1 class="serif">No client at ${escapeHTML(targetEmail)}</h1><p><a href="/account/admin">← back</a></p>`,
    }));
  }

  const nextStates = VALID_NEXT_STATES[user.state] || [];
  const advanceForm = nextStates.length ? `
    <form method="POST" action="/api/admin/advance-state">
      <input type="hidden" name="email" value="${escapeAttr(targetEmail)}">
      <label>Advance state to:
        <select name="new_state">
          ${nextStates.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </label>
      <button type="submit" class="cta">Advance</button>
    </form>
  ` : '<p class="panel-content">No state transitions available from this state.</p>';

  const cw = user.onboarding && user.onboarding.context_worksheet;
  const cwHtml = cw ? `
    <dl class="worksheet">
      <dt>Business</dt><dd>${escapeHTML(cw.business || '—')}</dd>
      <dt>Pain</dt><dd>${escapeHTML(cw.current_pain || '—')}</dd>
      <dt>Tools</dt><dd>${(cw.current_tools || []).map(escapeHTML).join(', ') || '—'}</dd>
      <dt>Desired</dt><dd>${escapeHTML(cw.desired_outcome || '—')}</dd>
      <dt>Nervous</dt><dd>${escapeHTML(cw.nervous_about || '—')}</dd>
      <dt>Technical level</dt><dd>${escapeHTML(cw.technical_level || '—')}</dd>
      <dt>Anything else</dt><dd>${escapeHTML(cw.anything_else || '—')}</dd>
    </dl>
  ` : '<p class="panel-content">No worksheet submitted yet.</p>';

  const engagementsHtml = (user.engagements || []).map(e => `
    <li>${escapeHTML(e.type)} — ${e.completed ? 'completed' : (e.active ? 'active' : 'purchased')} ${(e.purchased_at || e.started_at || '').split('T')[0]}</li>
  `).join('');

  const mainContent = `
    <p><a href="/account/admin">← back to list</a></p>
    <h1 class="serif">${escapeHTML(user.name || user.email)}</h1>
    <p class="subtitle">${escapeHTML(user.email)} · <span class="state-badge state-${user.state}">${user.state}</span></p>

    <section class="panel">
      <div class="panel-title">State management</div>
      ${advanceForm}
    </section>

    <section class="panel">
      <div class="panel-title">Context worksheet</div>
      ${cwHtml}
    </section>

    <section class="panel">
      <div class="panel-title">Engagements</div>
      <ul class="panel-content">${engagementsHtml || '<li>None</li>'}</ul>
    </section>

    <section class="panel">
      <div class="panel-title">Session balance <span class="subtitle">(remaining to book: ${computeBalance(user).remaining})</span></div>
      <p class="panel-content subtitle">Set what's real — many sessions were booked by direct calendar invite, so the auto-count won't match. Bump <em>total</em> to record a second block bought via a Stripe invoice.</p>
      ${(user.engagements || []).map((e, i) => {
        const b = engagementBalance(e);
        return `
        <form method="POST" action="/api/admin/set-balance" class="balance-row">
          <input type="hidden" name="email" value="${escapeAttr(targetEmail)}">
          <input type="hidden" name="index" value="${i}">
          <strong>${escapeHTML(e.type)}</strong>${e.completed ? ' (completed)' : ''} —
          used <input type="number" name="sessions_used" value="${b.used}" min="0" style="width:4rem"> of
          total <input type="number" name="sessions_total" value="${typeof b.total === 'number' ? b.total : ''}" min="0" style="width:4rem">
          <button type="submit" class="cta-secondary">Save</button>
        </form>`;
      }).join('') || '<p class="panel-content">No engagements.</p>'}
    </section>

    <section class="panel">
      <div class="panel-title">Drive folder link (client materials)</div>
      <form method="POST" action="/api/admin/set-balance">
        <input type="hidden" name="email" value="${escapeAttr(targetEmail)}">
        <input type="url" name="drive_folder_url" value="${escapeAttr(user.drive_folder_url || '')}" placeholder="https://drive.google.com/…" style="width:100%">
        <button type="submit" class="cta-secondary">Save link</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title">Onboarding</div>
      <p class="panel-content">Step ${user.onboarding ? user.onboarding.step : 'unknown'} · install checklist: ${Object.entries((user.onboarding && user.onboarding.install_checklist) || {}).filter(([_,v]) => v).map(([k]) => k).join(', ') || 'none'}</p>
    </section>

    <section class="panel">
      <div class="panel-title">Notes from Sam (private)</div>
      <form method="POST" action="/api/admin/notes">
        <input type="hidden" name="email" value="${escapeAttr(targetEmail)}">
        <textarea name="notes" rows="6">${escapeHTML(user.notes_from_sam || '')}</textarea>
        <button type="submit" class="cta-secondary">Save notes</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title">Manual actions</div>
      <form method="POST" action="/api/admin/resend-link" style="display:inline">
        <input type="hidden" name="email" value="${escapeAttr(targetEmail)}">
        <button type="submit" class="cta-secondary">Resend welcome magic link</button>
      </form>
    </section>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({ title: user.name || user.email, activeRoute: 'admin', isAdmin: true, mainContent }));
};

function escapeHTML(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHTML(s); }
