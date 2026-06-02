'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');

const PACK_VISIBILITY = {
  'onboarding-incomplete': ['1a-preview'],
  'pre-s1': ['1a-preview'],
  'between-s1-s2': ['1a'],
  'between-s2-s3': ['1a', '1b'],
  'between-s3-s4': ['1a', '1b', '2'],
  'post-s4-decision': ['1a', '1b', '2'],
  'retainer-active': ['1a', '1b', '2'],
  'graduated': ['1a', '1b', '2'],
  'cohort-active': ['cohort'],
};

const PACK_META = {
  '1a-preview': { title: 'Pack #1a — preview', desc: 'Karpathy + Nate Herk prompts (preview — Sam walks you through these in S1).', href: '/install-guide.pdf' },
  '1a': { title: 'Pack #1a — sandbox prompts', desc: 'Karpathy + Nate Herk prompts to fire in your sandbox between sessions.', href: '/install-guide.pdf' },
  '1b': { title: 'Pack #1b — flower exercise + EA build', desc: 'Restructure your stack + Parachute flower exercise.', href: '/pack-1b.pdf' },
  '2': { title: 'Pack #2 — integration + advanced', desc: 'MCP connections + advanced workflows.', href: '/pack-2.pdf' },
  'cohort': { title: 'Cohort Pack', desc: 'Shared cohort pack.', href: null },
};

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;

  const visible = PACK_VISIBILITY[user.state] || [];
  let packsHtml = '';
  for (const key of visible) {
    const meta = PACK_META[key];
    if (!meta) continue;
    let href = meta.href;
    if (key === 'cohort' && user.cohort_id) {
      const cohort = await kv.getCohort(user.cohort_id);
      href = cohort && cohort.pack_overleaf_url;
    }
    packsHtml += `
      <section class="panel">
        <div class="panel-title">${meta.title}</div>
        <div class="panel-content">${meta.desc}</div>
        ${href ? `<a href="${href}" class="cta" target="_blank" rel="noopener">Open →</a>` : ''}
      </section>
    `;
  }
  if (!packsHtml) packsHtml = '<section class="panel"><div class="panel-content">No packs available yet.</div></section>';

  const mainContent = `<h1 class="serif">Packs</h1>${packsHtml}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Packs', activeRoute: 'packs',
    isAdmin: isAdmin(user.email), mainContent,
  }));
};
