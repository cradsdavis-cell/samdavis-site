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

// Pack links are resolved at request time from env vars (Overleaf read-only / Drive
// view links Sam sets in Vercel) — NOT hardcoded file paths. The previous static
// /install-guide.pdf etc. 404'd because those PDFs never existed; packs are delivered
// per-client via Overleaf/Drive. When a pack's URL isn't configured we degrade
// gracefully (a "Sam shares this with you" note) instead of rendering a dead button —
// the same way the cohort pack already handles a null URL.
// Display titles use the canonical Pack 0 to 4 scheme (locked 2026-06-18). The MAP KEYS
// ('1a-preview','1a','1b','2','cohort') are internal state-machine identifiers and are
// deliberately left unchanged — renaming them would require a KV migration + env re-point.
const PACK_META = {
  '1a-preview': { title: 'Pack 1 — Starter Prompts (preview)', desc: 'Starter prompts — Sam walks you through these and fires them with you in Session 1.', env: 'PACK_1A_URL' },
  '1a': { title: 'Pack 1 — Starter Prompts', desc: 'Starter prompts to fire in your sandbox between sessions.', env: 'PACK_1A_URL' },
  '1b': { title: 'Pack 2 — Make it you', desc: 'Restructure your stack into a real EA + the self-mapping (flower) exercise.', env: 'PACK_1B_URL' },
  '2': { title: 'Pack 3 — Connect it', desc: 'Connect your tools — Capture/Ingest + MCP wiring (email, calendar, Todoist, Slack).', env: 'PACK_2_URL' },
  'cohort': { title: 'Cohort Pack', desc: 'Shared cohort pack.', env: null },
};

// Only allow http(s) links through to the href to avoid javascript:/data: URIs sneaking
// in from a misconfigured env var or cohort record, and escape the attribute value.
function safeHref(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return null;
  return url.trim().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;

  const visible = PACK_VISIBILITY[user.state] || [];
  let packsHtml = '';
  for (const key of visible) {
    const meta = PACK_META[key];
    if (!meta) continue;
    let rawHref = meta.env ? process.env[meta.env] : null;
    if (key === 'cohort' && user.cohort_id) {
      const cohort = await kv.getCohort(user.cohort_id);
      rawHref = cohort && cohort.pack_overleaf_url;
    }
    const href = safeHref(rawHref);
    const action = href
      ? `<a href="${href}" class="cta" target="_blank" rel="noopener">Open →</a>`
      : `<p class="panel-content" style="opacity:.75;font-style:italic;">Sam shares this with you directly — it'll be in your Drive folder, or ask in your session.</p>`;
    packsHtml += `
      <section class="panel">
        <div class="panel-title">${meta.title}</div>
        <div class="panel-content">${meta.desc}</div>
        ${action}
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
