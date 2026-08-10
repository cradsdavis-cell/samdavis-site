'use strict';
// /app/minerals — the account's first screen (ruling 4), listing what this
// account can REACH (ruling 9).
//
// Ownership is an attribute of a row, never the filter. Filtering by ownership
// hides the assistant a person uses every day whenever a company owns it,
// which is the normal case in the Practice Partner model: the rock holds the
// pebbles, the member uses one.
//
// Three sources, deliberately kept distinguishable rather than blended:
//   /my-minerals — the ownership/access mirror. The authority on what you can
//                  reach and who holds it.
//   /edges       — the tie layer: which rock a mineral is anchored to or
//                  joined with. Adds the relationship, never access.
//   /my-boxes    — legacy self-registrations, kept until every mineral carries
//                  a serial. A claim by a machine, not proof of anything.
//
// Honesty rules, both learned the hard way: a failed read is never rendered as
// "you have none", and a page never states something it cannot know.
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
  if (m.tier) chips.push(`<span class="chip">${escapeHtml(m.tier)}</span>`);
  if (m.role === 'owner') chips.push('<span class="chip good">yours</span>');
  else if (m.role === 'user') chips.push('<span class="chip">shared with you</span>');
  if (m.tie && TIE_CHIP[m.tie]) chips.push(TIE_CHIP[m.tie]);
  if (m.status && m.status !== 'active') chips.push(`<span class="chip warn">${escapeHtml(m.status)}</span>`);
  if (m.legacy) chips.push('<span class="chip">registered itself</span>');

  // who holds it, in words the reader can act on
  let held = '';
  if (m.held_by === 'you') held = 'held by you';
  else if (m.held_by && m.held_by !== 'someone else') held = `held by <b>${escapeHtml(m.held_by)}</b>`;
  else if (m.held_by === 'someone else') held = 'held by someone else, shared with you';
  else if (m.ownedByOrg) held = `held by <b>${escapeHtml(m.orgDisplay || 'the rock')}</b>`;

  const where = m.org ? `${m.tie === 'joined' ? 'a member of' : 'anchored to'} <b>${escapeHtml(m.orgDisplay || m.org)}</b>` : '';
  const lines = [held, where].filter(Boolean).join(' &middot; ');
  const members = m.tier === 'rock' && typeof m.members === 'number'
    ? `<div class="sub">${m.members} member${m.members === 1 ? '' : 's'}</div>` : '';

  return `<div class="card">
  <h2>${escapeHtml(m.name || m.label || m.mineral_id || 'a mineral')}</h2>
  ${m.host ? `<div class="sub">${escapeHtml(m.host)}</div>` : ''}
  ${lines ? `<div class="sub">${lines}</div>` : ''}
  ${members}
  <div class="chips">${chips.join('')}</div>
</div>`;
}

/** One row per mineral: the mirror is the authority, ties and legacy rows enrich it. */
function assemble({ minerals = [], edges = [], boxes = [] }) {
  const rows = new Map();
  const keyOf = (s) => String(s || '').replace(/-box$/, '').toLowerCase();

  for (const m of minerals) {
    const key = keyOf(m.label || m.host || m.mineral_id);
    rows.set(key, {
      key, mineral_id: m.mineral_id, name: m.label || m.host || m.mineral_id,
      host: m.host || '', tier: m.tier || '', role: m.role || '', held_by: m.held_by || '',
      anchor: m.anchor || '', status: 'active', authoritative: true,
    });
  }
  // ties add the relationship to a row the mirror already knows, or stand alone
  // for a mineral that has not registered yet
  for (const e of edges) {
    if (!e || (e.role && e.role !== 'member')) continue;
    const key = keyOf(e.slug || e.box || e.org);
    const row = rows.get(key) || { key, name: e.slug || e.box || e.org, host: e.box || '', status: 'active' };
    row.org = e.org;
    row.orgDisplay = e.org_display || e.org;
    row.tie = e.rel || 'joined';
    row.status = e.status || 'active';
    row.ownedByOrg = e.owner === 'org';
    if (!row.tier) row.tier = e.tier || '';
    rows.set(key, row);
  }
  for (const b of boxes) {
    if (!b || !b.host) continue;
    const key = keyOf(b.host);
    const row = rows.get(key) || { key, name: b.label || b.host, host: b.host, status: 'active' };
    if (!row.authoritative) row.legacy = true;   // a self-registration is a claim, not proof
    if (!row.name) row.name = b.label || b.host;
    row.host = row.host || b.host;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const dir = directoryFor(user);
  // Each read is independent and may be absent on an older reader: one missing
  // method must degrade the page, never throw it away entirely.
  const ask = (name) => (typeof dir[name] === 'function'
    ? dir[name]().catch((e) => ({ ok: false, reason: String(e && e.message || e) }))
    : Promise.resolve({ ok: false, reason: `this page cannot read ${name} yet` }));
  const [minR, edgesR, boxesR, noticesR] = await Promise.all([
    ask('minerals'), ask('edges'), ask('boxes'), ask('notices'),
  ]);

  let main = `<h1>Your minerals</h1>
<p class="lead">Everything this account can reach. Open one from the Crads-AI app on a machine whose keys it knows.</p>`;

  const reads = [minR, edgesR, boxesR];
  const failed = reads.filter((r) => !r.ok);
  if (failed.length === reads.length) {
    main += `<div class="problem"><b>Could not read your minerals just now.</b>
      <div class="note">${escapeHtml(failed[0].reason)}. Nothing is wrong with your minerals; this page could not ask. Try again in a moment.</div></div>`;
  } else {
    if (failed.length) {
      main += `<div class="problem"><b>Part of this page could not load.</b>
        <div class="note">${escapeHtml(failed[0].reason)}. What is shown below is real, but it may be incomplete.</div></div>`;
    }
    const rows = assemble({
      minerals: minR.ok ? minR.minerals : [],
      edges: edgesR.ok ? edgesR.edges : [],
      boxes: boxesR.ok ? boxesR.boxes : [],
    });
    main += rows.length
      ? rows.map(renderRow).join('\n')
      : `<div class="empty"><b>Nothing to show for this account yet.</b>
         <p class="note">A mineral appears here once it records this account as its holder, or grants it access.
         Minerals created before that record existed need claiming once, from the mineral itself.</p>
         <p class="note">So if you know you have one, this list is incomplete rather than wrong:
         check you signed in with the email your minerals know, and open it from the Crads-AI app in the meantime.</p></div>`;
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
module.exports.assemble = assemble;
