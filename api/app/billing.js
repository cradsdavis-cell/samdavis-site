'use strict';
// /app/billing — the PRODUCT's billing, and only the product's (Sam's ruling,
// 2026-08-10 app audit). The old page stitched three orphans together: a
// Stripe portal wired to the coaching customer base, coaching pack history,
// and a rocks card that admitted it couldn't know anything.
// Coaching stays fully reachable at its own /account URLs for existing
// clients; it does not appear in the product app.
//
// What this page says now is the truth and nothing else: what the account
// holds, that nothing is charged today, and where the numbers will appear
// when pricing arms.
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const dir = directoryFor(user);
  const minR = typeof dir.minerals === 'function'
    ? await dir.minerals().catch((e) => ({ ok: false, reason: String(e && e.message || e) }))
    : { ok: false, reason: 'unreadable' };

  let main = `<h1>Billing</h1>
<p class="lead">What this account pays for its minerals. One account, one bill, whatever it holds.</p>`;

  // the headline fact, stated once and plainly
  main += `<div class="card">
  <h2>Nothing is being charged today</h2>
  <div class="sub">Crads-AI pricing is not switched on yet. When it is, each mineral you hold becomes a line
  here with its price, and nothing starts billing without you seeing it first.</div>
</div>`;

  if (minR.ok) {
    const held = minR.minerals.filter((m) => m.held_by === 'you');
    if (held.length) {
      const rows = held.map((m) => `<div class="card">
  <h2>${escapeHtml(m.label || m.host || 'a mineral')}</h2>
  <div class="sub">${escapeHtml(m.tier === 'rock' ? 'Rock' : 'Pebble')} &middot; billed to this account when pricing arms &middot; <b>$0 today</b></div>
</div>`).join('');
      main += `<h1 style="margin-top:1.6em;font-size:1.15em">What this account holds</h1>${rows}`;
      if (held.some((m) => m.tier === 'rock')) {
        main += `<p class="note">A rock&#8217;s member seats will be itemised on the rock&#8217;s own line when per-seat pricing arms.</p>`;
      }
    } else {
      main += `<p class="note" style="margin-top:1.2em">This account holds no minerals yet, so there is nothing that could be billed.</p>`;
    }
  } else {
    main += `<div class="problem" style="margin-top:1.2em"><b>Could not read what this account holds just now.</b>
      <div class="note">${escapeHtml(minR.reason)}. Nothing is being charged either way.</div></div>`;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Billing', active: 'billing', email: user.email, isAdmin: isAdmin(user.email), main }));
};
