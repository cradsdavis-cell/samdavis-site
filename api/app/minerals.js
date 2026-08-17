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
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { directoryFor, mergeMinerals } = require('../../lib/directory');
const { freshnessChip, stalenessNote } = require('../../lib/mineralView');

const EXPAND_STYLE = `
  details.expand{margin-top:.75em;border-top:1px solid var(--line);padding-top:.7em}
  details.expand summary{cursor:pointer;color:var(--soft);font-size:.92em}
  details.expand ul.ties{list-style:none;margin:.7em 0 0;padding:0}
  details.expand ul.ties li{padding:.55em .8em;background:var(--card-2);border-radius:9px;margin-bottom:.45em}
  details.expand ul.ties li .sub{color:var(--soft);font-size:.88em;margin-top:.15em}
`;

const TIE_CHIP = {
  anchored: '<span class="chip good">anchored</span>',
  joined: '<span class="chip">joined</span>',
};

// A container id (12 hex chars) is what os.hostname() returns inside a box. It
// is not a name, and showing it as one is how "Your minerals" ended up listing
// "1c8db1bea6a3". Treat it as an address with no name attached.
const CONTAINER_ID = /^[0-9a-f]{12}$/;
const displayName = (m) => {
  const label = String(m.label || '').trim();
  if (label) return label;
  const host = String(m.host || m.name || '').trim();
  if (host && !CONTAINER_ID.test(host)) return host.split('.')[0];
  if (m.tier === 'rock' && m.anchor && m.anchor !== 'crads-ai') return m.anchor;
  return m.tier === 'rock' ? 'an unnamed rock' : 'an unnamed pebble';
};

// YOURS AND SHARED ARE THE SAME QUESTION ASKED ONCE (2026-08-12, Sam: "there
// should be distinctions in the app between a mineral that is yours and one
// that's shared with you").
//
// The chip used to come from `role` and the line from `held_by`, which are two
// different facts: role is what you may DO, held_by is whose it IS. So an
// owner-ROLE grant on somebody else's mineral rendered a green "yours" chip
// directly above "held by someone else" (finding 33). Both were accurate and
// together they were nonsense.
//
// Ownership now answers ownership, and the role becomes a separate, quieter
// statement of what you can do — shown only when it adds something, which is
// when you have admin-level access to a mineral that is NOT yours. On your own
// mineral "you can manage it" is noise.
function renderRow(m) {
  const isYours = m.held_by === 'you';
  const chips = [];
  if (m.tier) chips.push(`<span class="chip">${escapeHtml(m.tier)}</span>`);
  chips.push(isYours
    ? '<span class="chip good">yours</span>'
    : '<span class="chip">shared with you</span>');
  // Reads `admin`, not `owner` (2026-08-14). /my-minerals sends the caller's own
  // role here, and no path has ever produced an `owner` grant: the box accepts
  // member|admin only. So this chip could never fire, one page over from the same
  // dead chip on /app/access. It now says the one thing the role actually
  // carries, in the same words that page uses.
  if (!isYours && m.role === 'admin') chips.push('<span class="chip">you can invite people</span>');
  if (m.tie && TIE_CHIP[m.tie]) chips.push(TIE_CHIP[m.tie]);
  // one chip per tie KIND: an anchored pebble that also joined a community
  // carries both chips (run-6 multi-tie fix)
  if ((m.ties || []).some((t) => t.tie === 'joined') && m.tie !== 'joined') chips.push(TIE_CHIP.joined);
  if (m.status && m.status !== 'active') chips.push(`<span class="chip warn">${escapeHtml(m.status)}</span>`);
  if (m.legacy) chips.push('<span class="chip">registered itself</span>');

  // Who holds it. The chip has already said what your relationship to it is, so
  // this says WHOSE it is and stops: repeating "shared with you" here is what
  // made the old card read like an argument with itself.
  let held = '';
  if (isYours) held = 'held by you';
  else if (m.held_by && m.held_by !== 'someone else') held = `held by <b>${escapeHtml(m.held_by)}</b>`;
  else if (m.held_by === 'someone else') held = 'held by someone else';
  else if (m.ownedByOrg) held = `held by <b>${escapeHtml(m.orgDisplay || 'the rock')}</b>`;

  // DO NOT SAY THE SAME ORG TWICE. An org-held pebble rendered "held by Acme
  // Ltd · a member of Acme Ltd", which is the card arguing with itself again
  // (the same failure the yours/shared chips were fixed for on 2026-08-12).
  // When the holder IS the rock, ownership has already answered where it lives,
  // so the tie only needs to say which KIND of tie it is.
  const orgName = m.orgDisplay || m.org || '';
  const heldByThisOrg = orgName && (m.ownedByOrg || (m.held_by && m.held_by === orgName));
  const where = m.org
    ? (heldByThisOrg
      ? (m.tie === 'joined' ? 'joined to it' : 'anchored to it')
      : `${m.tie === 'joined' ? 'a member of' : 'anchored to'} <b>${escapeHtml(orgName)}</b>`)
    : '';
  // secondary ties (a join beside the anchor, or further joins) get their own
  // clause each, so no membership is invisible on the member's own page
  const extraTies = (m.ties || []).filter((t) => t.org !== m.org)
    .map((t) => `${t.tie === 'joined' ? 'a member of' : 'anchored to'} <b>${escapeHtml(t.orgDisplay || t.org)}</b>`);
  const lines = [held, where, ...extraTies].filter(Boolean).join(' &middot; ');
  const members = m.tier === 'rock' && typeof m.members === 'number'
    ? `<div class="sub">${m.members} member${m.members === 1 ? '' : 's'}</div>` : '';

  const title = displayName(m);
  // never print the address twice: as the heading and again beneath it
  const addr = m.host && String(m.host) !== title ? `<div class="sub">${escapeHtml(m.host)}</div>` : '';
  // the card's one action: the desktop app registers crads-ai:// (protocol.mjs),
  // and crads-ai://box/<slug> lands straight in this mineral. A card that goes
  // nowhere is a dead end, which is exactly what the audit called this page.
  const slug = String(m.host || m.key || '').split('.')[0].replace(/-box$/, '');
  const addressable = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(slug);

  // A ROW WITH NO MIRROR RECORD IS NOT OPENABLE (finding 76, 2026-08-12).
  //
  // `assemble` builds rows from the mirror AND from ties, and a tie is allowed to
  // stand alone because a mineral may not have registered YET. Nothing separated
  // that from "no longer exists", so a destroyed pebble kept a full card with a
  // working-looking open link: local-pebble-test-2 rendered here with a tier
  // badge and a deep link while it reconciled 6/6 FAIL across metal, edge and
  // directory. /app/admin, which reads mirror records only, correctly showed it
  // gone. Two surfaces of one product, same account, different answers.
  //
  // Both states are now said out loud instead of guessed at, and neither offers
  // an action that cannot work. The honest version is also the useful one for the
  // invited case: a rock-stamped pebble sits at status `invited` until its member
  // claims it (finding 83), so its owner gets an email saying it is ready and,
  // before this, a page that mentioned nothing at all.
  const open = !addressable ? ''
    : m.authoritative
      ? `<div style="margin-top:.75em"><a class="act" href="crads-ai://box/${escapeHtml(slug)}">Open in the app</a>
       <span class="note" style="margin-left:.6em">Needs the Crads-AI app on this machine</span></div>`
      : `<div style="margin-top:.75em"><span class="note">Not ready to open yet. This mineral has not reported in,
       so it is either still being set up or waiting for whoever it was invited for to claim it.</span></div>`;
  if (!m.authoritative) chips.push('<span class="chip warn">not reported in</span>');
  // HOW OLD IS THIS (2026-08-13). The mirror is a heartbeat, not a change
  // stamp: enrol-sync re-registers every two minutes whether or not anything
  // changed, so a stale `updated` means the machine stopped talking. Nothing
  // rendered below it should be read as current, and the chip is what says so.
  const stale = m.authoritative ? freshnessChip(m.updated) : '';
  if (stale) chips.push(stale);

  return `<div class="card">
  <h2>${escapeHtml(title)}</h2>
  ${addr}
  ${lines ? `<div class="sub">${lines}</div>` : ''}
  ${members}
  <div class="chips">${chips.join('')}</div>
  ${renderExpand(m, title)}
  ${open}
</div>`;
}

// THE CARD UNFOLDS (Sam's ruling, grill round 4: "expands in place on the
// card", and round 3: a topology per mineral, from that mineral's perspective,
// one hop, minerals only).
//
// One hop and minerals only is the whole spec, and it is a tighter spec than it
// first looks: this is NOT the network diagram. It answers one question, "what
// is this thing attached to", from the point of view of the mineral you clicked.
// Its own devices and people are deliberately absent, because those live on the
// Access page where they can be acted on, and duplicating them here would give
// the product two places that answer the same question and can disagree.
//
// <details> rather than a script: it survives with JavaScript off, it is
// keyboard-operable for free, and the whole app shell carries exactly one
// script today (the timestamp localiser). Adding a second to fold a box would
// be a poor trade.
function renderExpand(m, title) {
  const rows = [];

  // Its anchor. A rock anchored to `crads-ai` is anchored to the platform
  // itself, which is not a relationship worth drawing.
  if (m.tie === 'anchored' && m.org) {
    // Tie words mean BILLING (Sam's ruling, run-6 audit 2026-08-17): anchored =
    // the rock carries the seat, joined = the member pays their own way. Who
    // HOLDS a mineral never moves with a tie, and the old sub-line ("the rock
    // holds it") said otherwise directly under a "held by you" line.
    rows.push(`<li><b>${escapeHtml(title)}</b> is anchored to <b>${escapeHtml(m.orgDisplay || m.org)}</b><div class="sub">Its home rock. Anchored means the rock carries this mineral's seat (hosting and bill). Who holds it does not change with a tie.</div></li>`);
    for (const t of (m.ties || []).filter((x) => x.org !== m.org && x.tie === 'joined')) {
      rows.push(`<li><b>${escapeHtml(title)}</b> has joined <b>${escapeHtml(t.orgDisplay || t.org)}</b><div class="sub">Joined means membership on the member's own bill: shared catalogue and brain, everything else stays theirs.</div></li>`);
    }
  } else if (m.tie === 'joined' && m.org) {
    rows.push(`<li><b>${escapeHtml(title)}</b> has joined <b>${escapeHtml(m.orgDisplay || m.org)}</b><div class="sub">Joined means membership on the member's own bill: shared catalogue and brain, everything else stays theirs.</div></li>`);
    for (const t of (m.ties || []).filter((x) => x.org !== m.org && x.tie === 'joined')) {
      rows.push(`<li><b>${escapeHtml(title)}</b> has also joined <b>${escapeHtml(t.orgDisplay || t.org)}</b><div class="sub">Same loose tie, another community.</div></li>`);
    }
  } else if (m.tier === 'rock') {
    rows.push(`<li><b>${escapeHtml(title)}</b> is a rock, so it is the anchor rather than the anchored.${typeof m.members === 'number' ? ` It carries ${m.members} member${m.members === 1 ? '' : 's'}.` : ''}</li>`);
  } else {
    rows.push(`<li><b>${escapeHtml(title)}</b> stands alone. It is anchored to no rock and has joined none.<div class="sub">Nothing is wrong with that: a solo pebble is a complete mineral.</div></li>`);
  }

  const note = m.authoritative ? stalenessNote(m.updated) : '';
  const serial = m.mineral_id ? `<div class="note">Serial ${escapeHtml(String(m.mineral_id).slice(0, 20))}…</div>` : '';

  return `<details class="expand">
    <summary>What it is attached to</summary>
    ${note ? `<p class="note"><b>${escapeHtml(note)}</b></p>` : ''}
    <ul class="ties">${rows.join('')}</ul>
    <p class="note">Who and what can reach it lives on <a href="/app/access">Access</a>, where you can also change it.</p>
    ${serial}
  </details>`;
}

/** One row per mineral: the mirror is the authority, ties and legacy rows enrich it. */
function assemble({ minerals = [], edges = [], boxes = [] }) {
  const rows = new Map();
  // One mineral is described three ways: the mirror knows its HOST
  // (keith.crads-ai.com), a tie knows its SLUG (keith), and a legacy
  // registration knows its ALIAS (keith-box). Reduce all three to the same
  // handle or the page lists the same machine two or three times.
  const keyOf = (s) => String(s || '').toLowerCase().split('.')[0].replace(/-box$/, '');

  for (const m of minerals) {
    // Key on HOST first, the one handle every source shares. Keying the mirror
    // on its label while box rows keyed on host is what made the same mineral
    // appear twice, once as itself and once as "registered itself".
    const key = keyOf(m.host || m.label || m.mineral_id);
    rows.set(key, {
      key, mineral_id: m.mineral_id, name: m.label || m.host || m.mineral_id, label: m.label || '',
      host: m.host || '', tier: m.tier || '', role: m.role || '', held_by: m.held_by || '',
      anchor: m.anchor || '', status: 'active', authoritative: true,
      updated: m.updated || 0,
    });
  }
  // ties add the relationship to a row the mirror already knows, or stand alone
  // for a mineral that has not registered yet.
  //
  // A mineral may hold SEVERAL ties at once (one anchor + any number of joins:
  // run-6 audit, 2026-08-17 — test-pebble-sam anchored to qa-r2-gmail AND
  // joined to e2e-a rendered only the anchor, so the join existed on the rock's
  // panel and nowhere on the member's own account). Every tie lands in
  // row.ties; the primary slot (row.tie/org) is the anchor when one exists,
  // else the first join, purely for the headline line.
  for (const e of edges) {
    if (!e || (e.role && e.role !== 'member')) continue;
    const key = keyOf(e.slug || e.box || e.org);
    const row = rows.get(key) || { key, name: e.slug || e.box || e.org, host: e.box || '', status: 'active' };
    const tie = { org: e.org, orgDisplay: e.org_display || e.org, tie: e.rel || 'joined', status: e.status || 'active', ownedByOrg: e.owner === 'org' };
    row.ties = (row.ties || []).filter((t) => t.org !== tie.org).concat([tie]);
    const primary = row.ties.find((t) => t.tie === 'anchored') || row.ties[0];
    row.org = primary.org;
    row.orgDisplay = primary.orgDisplay;
    row.tie = primary.tie;
    row.status = primary.status;
    row.ownedByOrg = primary.ownedByOrg;
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
    : Promise.resolve({ ok: false, reason: `This page cannot read ${name} yet` }));
  // legacy self-registrations no longer render here (Sam's ruling, 2026-08-10
  // audit): they are claims by machines, not minerals, and they live in Admin
  const [minR, edgesR] = await Promise.all([ask('minerals'), ask('edges')]);

  let main = `<style>${EXPAND_STYLE}</style>
<h1>Your minerals</h1>
<p class="lead">Everything this account can reach. Open one from the Crads-AI app on a machine whose keys it knows.</p>`;

  const reads = [minR, edgesR];
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
    });
    main += rows.length
      ? rows.map(renderRow).join('\n')
      : `<div class="empty"><b>Nothing to show for this account yet.</b>
         <p class="note">A mineral appears here once it records this account as its holder, or grants it access.
         Minerals created before that record existed need claiming once, from the mineral itself.</p>
         <p class="note">So if you know you have one, this list is incomplete rather than wrong:
         check you signed in with the email your minerals know, and open it from the Crads-AI app in the meantime.</p></div>`;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Your minerals', active: 'minerals', email: user.email, isAdmin: isAdmin(user.email), main }));
};
module.exports.assemble = assemble;
module.exports.renderRow = renderRow;   // exported for the finding-76 regression tests
