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
const { billingView } = require('../../lib/appBilling');
const { cradsPortalUrl } = require('../../lib/cradsPortal');
const Stripe = require('stripe');
const { priceTable } = require('../../lib/pricing');

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
    user, prices: priceTable(),
    minerals: minR.ok ? minR.minerals : [],
    events: evR.ok ? evR.events : [],
  });

  // a rock's display label, for the anchored-pebble line (never a raw handle)
  const labelOfOrg = (org) => {
    const m = (minR.ok ? minR.minerals : []).find((x) => x.tier === 'rock' && x.org === org);
    return (m && (m.label || m.host)) || org;
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // THE BREAKDOWN under every line (Sam, 2026-08-23: "more of a breakdown of
  // the prices on each listed mineral"): each component as unit × quantity =
  // amount, then the month total and what has accrued so far this period.
  const breakdown = (l) => {
    const rows = (l.parts || []).map((pt) => `<div>${escapeHtml(pt.label)}</div>
    <div class="u">${pt.carried !== undefined ? `${money(pt.carried)} paid by ${escapeHtml(labelOfOrg(l.anchor))}` : `${money(pt.unit)} &times; ${pt.qty}`}</div>
    <div class="a">${pt.carried !== undefined ? 'nothing to you' : money(pt.amount)}</div>`).join('');
    const total = l.kind === 'pebble-anchored'
      ? ''
      : `<div class="t">Per month</div><div class="u"></div><div class="t a">${money(l.monthly)}</div>
    <div>So far this period</div><div class="u">${l.days_so_far} of ${view.daysInPeriod} days</div><div class="a">${money(l.so_far)}</div>`;
    return `<div class="bparts">${rows}${total}</div>`;
  };

  // UX audit 2026-08-23: one idea per block, the money first. Scoped styles
  // reuse the shell's tokens only (no new colours, fonts or spacing values).
  let main = `<style>
  .bstat{display:flex;gap:2.2em;flex-wrap:wrap;align-items:flex-end;margin:.4em 0 .6em}
  .bstat b{display:block;font-size:2.1em;line-height:1.05;letter-spacing:-.01em;color:var(--ink);font-variant-numeric:tabular-nums}
  .bstat span{display:block;color:var(--soft);font-size:.9em;margin-top:.25em}
  .bstatus{display:flex;gap:1em;align-items:center;flex-wrap:wrap;justify-content:space-between;margin:0 0 1.2em;padding:.9em 1.1em;border:1px solid var(--line);border-radius:12px;background:var(--card-2)}
  .bstatus .l{display:flex;gap:.8em;align-items:center;flex-wrap:wrap}
  .bstatus .chip.on{background:var(--good);color:var(--card);border-color:var(--good)}
  .bstatus .chip.off{background:var(--bad);color:var(--card);border-color:var(--bad)}
  .bstatus form{margin:0}
  .blines{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden}
  .blines li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.3em 1.2em;align-items:baseline;padding:.95em 1.1em;border-top:1px solid var(--line)}
  .blines li:first-child{border-top:none}
  .blines .n{grid-column:1;grid-row:1;font-weight:600;color:var(--ink)}
  .blines .m{grid-column:1;grid-row:2;color:var(--soft);font-size:.92em}
  .blines .amt{grid-column:2;grid-row:1/span 2;align-self:center;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap;text-align:right}
  .blines .chip{margin-left:.5em;vertical-align:middle}
  .bparts{grid-column:1/-1;margin:.55em 0 0;padding:.55em 0 0;border-top:1px dashed var(--line);display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:.25em 1.2em;font-size:.9em;color:var(--soft);font-variant-numeric:tabular-nums}
  .bparts .u{text-align:right;white-space:nowrap;color:var(--faint)}
  .bparts .a{text-align:right;white-space:nowrap;color:var(--ink)}
  .bparts .t{color:var(--ink);font-weight:600}
  .bparts .t.u,.bparts .t.a{font-weight:600}
  .bfoot{color:var(--faint);font-size:.88em;margin:.8em .2em 0}
  @media (max-width:480px){.bstat b{font-size:1.7em}.blines li{grid-template-columns:1fr}.blines .amt{grid-row:3;grid-column:1;text-align:left}.bparts{grid-template-columns:minmax(0,1fr) auto}.bparts .u{display:none}}
</style>
<h1>Billing</h1>
<p class="lead">One account, one bill, for everything it holds.</p>`;

  // STATUS: the switch and its consequence, one line, not a card
  main += `<div class="bstatus">
  <div class="l">
    <span class="chip ${view.enabled ? 'on' : 'off'}">Billing ${view.enabled ? 'on' : 'off'}</span>
    <span class="sub" style="margin:0">${view.enabled
      ? 'You can create minerals, promote a pebble, anchor to a rock and receive a transfer.'
      : 'Turn billing on to create minerals, promote a pebble, anchor to a rock or receive a transfer. Leaving, downgrading and removing always work.'}</span>
  </div>
  <form method="POST" action="/app/billing"${view.enabled ? ` onsubmit="return confirm('Turn billing off?\\n\\nYou keep everything you hold. Until it is back on, this account cannot create a mineral, promote, anchor to a rock or receive a transfer.')"` : ''}>
    <input type="hidden" name="billing_enabled" value="${view.enabled ? 'off' : 'on'}">
    <button class="act${view.enabled ? ' quiet' : ''}" type="submit">${view.enabled ? 'Turn off' : 'Turn billing on'}</button>
  </form>
</div>`;

  // THE STATEMENT: the two figures are the page
  main += `<div class="card">
  <div class="chips"><span class="chip">${view.charging ? escapeHtml(view.period) : (view.priced ? 'Indicative pricing · nothing is charged yet' : 'Nothing is charged today')}</span></div>
  <div class="bstat">
    <div><b>${money(view.soFar)}</b><span>so far this period</span></div>
    <div><b>${money(view.monthly)}</b><span>per month at what you hold now</span></div>
  </div>
  <div class="note">${view.charging
    ? `Pro-rated by the days each mineral existed this period. Your Stripe invoice is the record; this is the running view.`
    : view.priced
      ? `What this account would pay at the indicative rates, pro-rated by the days each mineral existed this period. Crads-AI is in beta: no card is charged and no invoice is sent until pricing is switched on, and you will be told first.`
      : `Launch pricing is $0 while Crads-AI is in beta. When prices are set, your figures appear here first and your invoice follows.`}</div>
</div>`;

  // THE BALANCE. Under the balance model (spec ai-os 2026-08-26-balance-billing)
  // this is the number that matters: what is in the account, what it burns a
  // day, and how long that lasts. Shown only when the cockpit has published a
  // row, so the page is unchanged for an account that has never been drawn
  // from, and unchanged entirely while the balance path is unarmed.
  {
    const bal = await dir.balance().catch(() => ({ ok: false }));
    if (bal.ok && !bal.none) {
      const runway = bal.runwayDays;
      // A runway that cannot be computed (nothing is being drawn) is NOT zero.
      // Those two mean opposite things and a billing page must not confuse them.
      const runwayText = bal.burnCents <= 0
        ? 'nothing is being drawn at the moment'
        : runway === null ? 'runway unknown'
        : `about ${runway} day${runway === 1 ? '' : 's'} at this rate`;
      const low = bal.burnCents > 0 && runway !== null && runway <= 7;
      main += `<div class="card" style="margin-top:1.2em">
  <div class="chips"><span class="chip">${low ? 'Running low' : 'Balance'}</span></div>
  <div class="bstat">
    <div><b>${money(bal.balanceCents)}</b><span>in your account</span></div>
    <div><b>${money(bal.burnCents)}</b><span>per day at what you hold now</span></div>
  </div>
  <div class="note">${escapeHtml(runwayText)}.${low ? ' Your card is charged automatically before it runs out.' : ''}</div>
</div>`;
    }
  }

  // THE CARD AND THE INVOICES. Stripe hosts all of it; this is the door to it.
  // Shown only when a platform customer actually exists, because a button that
  // opens an error is worse than no button. Silent when Stripe cannot be read:
  // the figures above are what this page is for.
  {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const portal = stripeKey
      ? await cradsPortalUrl({
          stripe: new Stripe(stripeKey),
          email: user.email,
          returnUrl: `${process.env.BASE_URL || 'https://crads-ai.com'}/app/billing`,
        })
      : { url: null, why: 'not configured' };
    if (portal.url) {
      main += `<div class="card" style="margin-top:1.2em">
  <h2 class="cardh2">Payment method and invoices</h2>
  <div class="note">${view.charging
    ? 'Your card, your invoices and your receipts, all held by Stripe.'
    : 'Nothing is charged yet, so there are no invoices to read. You can still put a card on file now, and it will be the one used when pricing is switched on.'}</div>
  <p style="margin:.9em 0 0"><a class="act" href="${escapeHtml(portal.url)}" target="_blank" rel="noopener">Manage in Stripe</a></p>
</div>`;
    }
  }

  // THE LINES
  if (minR.ok) {
    if (view.lines.length) {
      const rows = view.lines.map((l) => {
        if (l.kind === 'rock') {
          const tierN = l.tier.replace('crads-rock-tier-', '');
          return `<li><div class="n">${escapeHtml(l.label)}<span class="chip">Rock</span></div>
  <div class="m">${plural(l.seats, 'member', 'members')} &middot; hosts ${l.hosting ? plural(l.hosting, 'anchored member', 'anchored members') : 'no anchored members'} &middot; tier ${escapeHtml(tierN)}</div>
  <div class="amt">${money(l.monthly)}<span style="color:var(--faint);font-weight:400">/mo</span></div>${breakdown(l)}</li>`;
        }
        if (l.kind === 'pebble-direct') {
          return `<li><div class="n">${escapeHtml(l.label)}<span class="chip">Pebble</span></div>
  <div class="m">Hosted by Crads-AI directly</div>
  <div class="amt">${money(l.monthly)}<span style="color:var(--faint);font-weight:400">/mo</span></div>${breakdown(l)}</li>`;
        }
        return `<li><div class="n">${escapeHtml(l.label)}<span class="chip">Pebble</span></div>
  <div class="m">${escapeHtml(labelOfOrg(l.anchor))} pays for this pebble</div>
  <div class="amt" style="color:var(--faint);font-weight:400">nothing to you</div>${breakdown(l)}</li>`;
      }).join('');
      main += `<h2 class="cardh2" style="margin-top:1.6em">What you hold</h2><ul class="blines">${rows}</ul>
<p class="bfoot">A rock pays a tier fee, set by how many members it has, plus hosting for each anchored member. Its own box is included in the tier fee. Joined members host their own pebble and pay Crads-AI for it directly.${view.priced && !view.charging ? ' Rates shown are indicative and may change before pricing is switched on.' : ''}</p>`;
    } else {
      main += `<div class="empty" style="margin-top:1.2em">You hold no minerals yet, so there is nothing to bill.</div>`;
    }
  } else {
    main += `<div class="problem" style="margin-top:1.2em"><b>Could not read what you hold just now.</b>
      <div class="note">${escapeHtml(minR.reason)}. Nothing is being charged either way.</div></div>`;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Billing', active: 'billing', email: user.email, isAdmin: isAdmin(user.email), main }));
};
