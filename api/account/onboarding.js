'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  if (user.state !== 'onboarding-incomplete') {
    return res.redirect(302, '/account/');
  }

  const requestedStep = parseInt((req.query && req.query.step) || '0', 10);
  const currentStep = (user.onboarding && user.onboarding.step) || 1;
  const step = requestedStep && requestedStep <= currentStep ? requestedStep : currentStep;

  const mainContent = renderStep({ step, user });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Onboarding', activeRoute: 'home',
    isAdmin: isAdmin(user.email), mainContent,
  }));
};

function renderStep({ step, user }) {
  const ladder = `
    <ol class="step-ladder">
      <li class="${step === 1 ? 'active' : (step > 1 ? 'done' : '')}"><a href="/account/onboarding?step=1">1. Welcome</a></li>
      <li class="${step === 2 ? 'active' : (step > 2 ? 'done' : '')}"><a href="/account/onboarding?step=2">2. Set up + first prompts</a></li>
      <li class="${step === 3 ? 'active' : (step > 3 ? 'done' : '')}"><a href="/account/onboarding?step=3">3. Context worksheet</a></li>
      <li class="${step === 4 ? 'active' : ''}"><a href="/account/onboarding?step=4">4. Book your first session</a></li>
    </ol>
  `;

  let body = '';
  if (step === 1) body = renderStep1();
  else if (step === 2) body = renderStep2(user);
  else if (step === 3) body = renderStep3(user);
  else if (step === 4) body = renderStep4(user);

  return `<h1 class="serif">Onboarding</h1>${ladder}<div class="step-content">${body}</div>`;
}

function renderStep1() {
  return `
    <h2 class="serif">Welcome to your first 4 sessions.</h2>
    <p>Over the next 4 weeks we'll move through 4 sessions of about 90 minutes each, with a couple of hours of self-paced work between each.</p>
    <p>The arc: get the stack working → play in a sandbox → build your first real workflows → leave with the confidence to keep building on your own.</p>
    <p>This onboarding takes about 15 minutes. Three more steps after this one. Let's go.</p>
    <form method="POST" action="/api/account/onboarding-step">
      <input type="hidden" name="step" value="1">
      <input type="hidden" name="action" value="continue">
      <button type="submit" class="cta">Get started →</button>
    </form>
  `;
}

function renderStep2(user) {
  const cl = (user.onboarding && user.onboarding.install_checklist) || {};
  const item = (key, label) => `<label class="install-item"><input type="checkbox" name="${key}" ${cl[key] ? 'checked' : ''}> ${label}</label>`;
  // Pack #1a content loaded from lib/content/pack-1a-prompts.html (created in Task 4.3 — for now placeholder)
  const fs = require('fs');
  const path = require('path');
  let pack1aHtml = '<p><em>(Pack #1a prompts content loading from lib/content/pack-1a-prompts.html)</em></p>';
  try {
    pack1aHtml = fs.readFileSync(path.join(__dirname, '../../lib/content/pack-1a-prompts.html'), 'utf8');
  } catch (e) { /* file not yet created */ }

  return `
    <h2 class="serif">Set up + first prompts</h2>
    <section>
      <h3>Install</h3>
      <p class="subtitle">Check off as you go.</p>
      <form id="install-form" method="POST" action="/api/account/onboarding-step">
        <input type="hidden" name="step" value="2">
        <input type="hidden" name="action" value="save_install">
        ${item('claude_code', 'Claude Code')}
        ${item('vs_code', 'VS Code')}
        ${item('obsidian', 'Obsidian')}
        ${item('cal_app', 'Cal.com app (optional)')}
        ${item('slack', 'Slack invite (if cohort or retainer)')}
        <p><a href="mailto:cradsdavis@gmail.com?subject=Stuck%20on%20installation">Stuck on installation? Email Sam.</a></p>
        <button type="submit" class="cta-secondary">Save progress</button>
      </form>
    </section>
    <section>
      <h3>Preview Pack #1a</h3>
      <p><em>In Session 1, Sam will walk you through these prompts and fire them with you in your sandbox. Don't run them solo — they're more useful with Sam at the keyboard alongside you. This preview is just so nothing's a surprise on the day.</em></p>
      ${pack1aHtml}
    </section>
    <form method="POST" action="/api/account/onboarding-step">
      <input type="hidden" name="step" value="2">
      <input type="hidden" name="action" value="continue">
      <button type="submit" class="cta">Got it →</button>
    </form>
  `;
}

function renderStep3(user) {
  const cw = (user.onboarding && user.onboarding.context_worksheet) || {};
  const v = (k) => escapeAttr(cw[k] || '');
  return `
    <h2 class="serif">Context worksheet</h2>
    <p class="subtitle">Sam reads this before your first session. Takes 5 minutes.</p>
    <form method="POST" action="/api/account/onboarding-step">
      <input type="hidden" name="step" value="3">
      <input type="hidden" name="action" value="submit_worksheet">
      <label>What's your business? (1-2 sentences)<br>
        <textarea name="business" required rows="2">${v('business')}</textarea>
      </label>
      <label>What's the workflow that's eating your week right now?<br>
        <textarea name="current_pain" required rows="3">${v('current_pain')}</textarea>
      </label>
      <label>What tools do you currently use day-to-day? (Check all that apply)<br>
        ${['gmail','slack','notion','asana','google-calendar','other'].map(t => `
          <label class="cw-checkbox"><input type="checkbox" name="current_tools" value="${t}" ${(cw.current_tools || []).includes(t) ? 'checked' : ''}> ${t.replace('-', ' ')}</label>
        `).join('')}
      </label>
      <label>What would feel different after our 4 sessions?<br>
        <textarea name="desired_outcome" required rows="3">${v('desired_outcome')}</textarea>
      </label>
      <label>Anything you're nervous about? (optional)<br>
        <textarea name="nervous_about" rows="2">${v('nervous_about')}</textarea>
      </label>
      <label>How technical are you, honestly?<br>
        ${['very','somewhat','not-at-all','dont-know'].map(t => `
          <label class="cw-radio"><input type="radio" name="technical_level" value="${t}" ${cw.technical_level === t ? 'checked' : ''}> ${t.replace('-', ' ')}</label>
        `).join('')}
      </label>
      <label>Anything else you want Sam to know? (optional)<br>
        <textarea name="anything_else" rows="2">${v('anything_else')}</textarea>
      </label>
      <button type="submit" class="cta">Save & continue →</button>
    </form>
  `;
}

function renderStep4(user) {
  const lastEngagement = (user.engagements || []).slice(-1)[0];
  const sku = lastEngagement && lastEngagement.type;

  if (sku === 'group-block' || sku === 'group-block-pay4') {
    return `
      <h2 class="serif">Your cohort starts soon</h2>
      <p>You're in the Group Block cohort. Sessions are already scheduled — no separate booking needed.</p>
      <p>Cohort dates land on your calendar; Sam will email confirmation + cohort details before Session 1.</p>
      <form method="POST" action="/api/account/onboarding-step">
        <input type="hidden" name="step" value="4">
        <input type="hidden" name="action" value="complete_onboarding">
        <button type="submit" class="cta">Finish onboarding →</button>
      </form>
    `;
  }

  return `
    <h2 class="serif">Book your first session</h2>
    <p class="subtitle">Pick a time that works. Sam shows up.</p>
    <div class="cal-embed-wrap">
      <iframe src="https://cal.com/crads-ai/${sku === 'single-session' ? 'single-session' : 'coaching-block'}"
              width="100%" height="600" frameborder="0"></iframe>
    </div>
    <p class="subtitle">Once you've booked, click below to finish.</p>
    <form method="POST" action="/api/account/onboarding-step">
      <input type="hidden" name="step" value="4">
      <input type="hidden" name="action" value="complete_onboarding">
      <button type="submit" class="cta">I've booked — finish onboarding →</button>
    </form>
  `;
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
