'use strict';
// /app/minerals — the account's first screen (arc A, ruling 4). What this
// account holds: every mineral tied to it, and every mineral that has
// registered itself against it.
//
// Honesty rules this page follows, both learned the hard way on the fleet cards:
//   - a failed read is never rendered as "you have none";
//   - a registration is a claim by a mineral, not proof of ownership, because
//     /box-register does not verify the owner hash it is given.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { directoryFor, mergeMinerals } = require('../../lib/directory');

const TIE_CHIP = {
  anchored: '<span class="chip good">anchored</span>',
  joined: '<span class="chip">joined</span>',
};

function renderRow(m) {
  const chips = [];
  if (m.tie && TIE_CHIP[m.tie]) chips.push(TIE_CHIP[m.tie]);
  if (m.ownedByOrg) chips.push('<span class="chip warn">owned by the rock</span>');
  if (m.tier) chips.push(`<span class="chip">${escapeHtml(m.tier)}</span>`);
  if (m.status && m.status !== 'active') chips.push(`<span class="chip warn">${escapeHtml(m.status)}</span>`);
  if (m.registered) chips.push('<span class="chip">registered itself</span>');

  const where = m.org
    ? `anchored to <b>${escapeHtml(m.orgDisplay)}</b>`
    : 'no rock: this one stands on its own';
  const addr = m.host ? `<div class="sub">${escapeHtml(m.host)}</div>` : '';

  return `<div class="card">
  <h2>${escapeHtml(m.name)}</h2>
  ${addr}
  <div class="sub">${m.tie === 'joined' ? `a member of <b>${escapeHtml(m.orgDisplay)}</b>` : where}</div>
  <div class="chips">${chips.join('')}</div>
</div>`;
}

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const dir = directoryFor(user);
  const [edgesR, boxesR, noticesR] = await Promise.all([dir.edges(), dir.boxes(), dir.notices()]);

  let main = `<h1>Your minerals</h1>
<p class="lead">Every pebble and rock this account holds. Open one from the Crads-AI app on a machine whose keys it knows.</p>`;

  // Unreadable is its own state, never silence and never "none".
  const failed = [edgesR, boxesR].filter((r) => !r.ok);
  if (failed.length === 2) {
    main += `<div class="problem"><b>Could not read your minerals just now.</b>
      <div class="note">${escapeHtml(failed[0].reason)}. Nothing is wrong with your minerals; this page could not ask. Try again in a moment.</div></div>`;
  } else {
    if (failed.length === 1) {
      main += `<div class="problem"><b>Part of this page could not load.</b>
        <div class="note">${escapeHtml(failed[0].reason)}. What is shown below is real, but it may be incomplete.</div></div>`;
    }
    const rows = mergeMinerals({
      edges: edgesR.ok ? edgesR.edges : [],
      boxes: boxesR.ok ? boxesR.boxes : [],
    });
    main += rows.length
      ? rows.map(renderRow).join('\n')
      : `<div class="empty"><b>Nothing yet.</b><br>
         When you create a pebble or anchor one to a rock, it appears here.
         If you already have one, make sure you signed in with the same email it knows.</div>`;
  }

  if (noticesR.ok && noticesR.notices.length) {
    main += '<h1 style="margin-top:1.6em;font-size:1.15em">Recently ended</h1>';
    for (const n of noticesR.notices) {
      main += `<div class="card">
        <h2>${escapeHtml(n.org_display || n.org)}</h2>
        <div class="sub">your ${escapeHtml(n.tie || 'tie')} here ended${n.reason ? `: ${escapeHtml(n.reason)}` : ''}</div>
      </div>`;
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Your minerals', active: 'minerals', email: user.email, main }));
};
