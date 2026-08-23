'use strict';
// /app/billing — the PRODUCT's billing, and only the product's (Sam's ruling,
// 2026-08-10 app audit; coaching stays at its own /account URLs).
//
// Money v2 + the billing placeholder (ruled 2026-08-23, ai-os
// docs/superpowers/specs/2026-08-23-billing-placeholder.md). The page carries:
//
//   THE SWITCH  `billing_enabled` on the user record, flipped HERE by the user
//               (they are the one signing up for billing). Today it stands in
//               for "a card is on file"; when pricing arms it becomes that fact
//               read from Stripe and this page does not change. The directory
//               reads it as a claim on the app token (lib/appAuth.js), so a
//               mineral cannot be created, promoted, anchored or received
//               without it. Nothing that REDUCES a bill is ever gated.
//   THE NUMBER  two figures computed on every read, never stored: so far this
//               period (pro-rated by days) and per month at current seats.
//               $0 by the 17 Aug beta ruling; real the day prices arm.
//   THE LINES   a rock = tier + hosting (own box + anchored members); a direct
//               pebble = hosting; an anchored pebble is on its rock's bill.
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');
const { billingView, ZERO } = require('../../lib/appBilling');

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e4) req.destroy(); });
    req.on('end', () => {
      try { resolve(Object.fromEntries(new URLSearchParams(raw))); } catch { resolve({}); }
    });
  });
}

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;

  // THE SWITCH. A POST flips it and redirects back (PRG); the page never shows
  // a state its own click has not yet written.
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const on = String(body.billing_enabled || '') === 'on';
    const rec = (await kv.getUser(user.email)) || user;
    rec.billing_enabled = on;
    rec.billing_enabled_at = on ? Date.now() : (rec.billing_enabled_at || null);
    await kv.setUser(user.email, rec);
    // every rock this account HOLDS learns the new state: the worker's gate for
    // acts that grow a rock's hosting line reads licence:<org>, not the member's
    // token. Best-effort: a directory that cannot answer must not undo the flip;
    // the next flip (or the backfill) repeats the mirror.
    const dirAfter = directoryFor(rec);
    const held = await dirAfter.minerals().catch(() => ({ ok: false }));
    if (held.ok) {
      for (const m of held.minerals) {
        if (m.held_by === 'you' && m.tier === 'rock') await dirAfter.setLicence(m.mineral_id).catch(() => ({ ok: false }));
      }
    }
    res.setHeader('Location', '/app/billing?saved=1');
    return res.status(303).end();
  }

  const dir = directoryFor(user);
  // THE PAGE IS THE MIRROR. The signing key lives only on Vercel (env pull
  // redacts it), so no script off the platform can mint the manage token the
  // mirror needs, and the backfill could not. Every visit with billing on
  // re-writes licence:<org> for each rock this account holds: idempotent,
  // self-healing, and exactly the state the worker's gate reads.
  if (user.billing_enabled) {
    const held = await dir.minerals().catch(() => ({ ok: false }));
    if (held.ok) {
      for (const m of held.minerals) {
        if (m.held_by === 'you' && m.tier === 'rock') await dir.setLicence(m.mineral_id).catch(() => ({ ok: false }));
      }
    }
  }
  const [minR, evR] = await Promise.all([
    typeof dir.minerals === 'function' ? dir.minerals().catch((e) => ({ ok: false, reason: String(e && e.message || e) })) : { ok: false, reason: 'unreadable' },
    typeof dir.events === 'function' ? dir.events(400).catch(() => ({ ok: false })) : { ok: false },
  ]);
  const view = billingView({
    user, prices: ZERO,
    minerals: minR.ok ? minR.minerals : [],
    events: evR.ok ? evR.events : [],
  });

  let main = `<h1>Billing</h1>
<p class="lead">What this account pays for its minerals. One account, one bill, whatever it holds.</p>`;

  // THE SWITCH
  main += `<div class="card">
  <h2>${view.enabled ? 'Billing is set up' : 'Billing is not set up'}</h2>
  <div class="sub">${view.enabled
    ? 'This account can create minerals, promote a pebble, anchor to a rock and receive a transfer.'
    : 'Until it is, this account cannot create a mineral, promote a pebble, anchor to a rock or receive a transfer. Leaving, downgrading and removing are never blocked.'}</div>
  <form method="POST" action="/app/billing" style="margin-top:.8em">
    <input type="hidden" name="billing_enabled" value="${view.enabled ? 'off' : 'on'}">
    <button type="submit">${view.enabled ? 'Switch billing off' : 'Set up billing'}</button>
  </form>
  <div class="note">Placeholder while pricing is off: the switch stands in for a card on file. Nothing is charged either way.</div>
</div>`;

  // THE NUMBER
  main += `<div class="card">
  <h2>${view.armed ? 'This period' : 'Nothing is being charged today'}</h2>
  <div class="sub"><b>${money(view.soFar)}</b> so far this period &middot; <b>${money(view.monthly)}</b> per month at current seats</div>
  <div class="note">${view.armed
    ? `Period ${escapeHtml(view.period)}, ${view.daysInPeriod} days, pro-rated by the days each mineral existed. Your Stripe invoice is the record; this is the running view.`
    : 'Crads-AI pricing is not switched on yet. These figures are computed from what you hold at launch pricing ($0) and become real the day prices arm, without this page changing.'}</div>
</div>`;

  // THE LINES
  if (minR.ok) {
    if (view.lines.length) {
      const rows = view.lines.map((l) => {
        if (l.kind === 'rock') {
          return `<div class="card">
  <h2>${escapeHtml(l.label)}</h2>
  <div class="sub">Rock &middot; ${escapeHtml(l.tier.replace('crads-rock-', ''))} &middot; ${l.seats} seat${l.seats === 1 ? '' : 's'} &middot; hosting &times; ${l.hosting} (own box${l.hosting > 1 ? ` + ${l.hosting - 1} anchored` : ''}) &middot; <b>${money(l.monthly)}/mo</b></div>
  <div class="note">Seats are every member tie, joined or anchored; they set the tier and are never charged. Hosting counts the boxes this rock runs.</div>
</div>`;
        }
        if (l.kind === 'pebble-direct') {
          return `<div class="card">
  <h2>${escapeHtml(l.label)}</h2>
  <div class="sub">Pebble &middot; hosted directly &middot; <b>${money(l.monthly)}/mo</b></div>
</div>`;
        }
        return `<div class="card">
  <h2>${escapeHtml(l.label)}</h2>
  <div class="sub">Pebble &middot; anchored at ${escapeHtml(l.anchor)} &middot; billed on that rock, not here</div>
</div>`;
      }).join('');
      main += `<h1 style="margin-top:1.6em;font-size:1.15em">What this account holds</h1>${rows}`;
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
