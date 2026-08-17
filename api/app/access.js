'use strict';
// /app/access — TWO surfaces on one route, and the split is deliberate.
//
//   /app/access?org=<handle>   the far end of an invitation link (unchanged)
//   /app/access                the access matrix: who and what can reach your
//                              minerals, and the place you change it
//
// WHY THEY SHARE A ROUTE. Every invitation ever sent points at
// /access?org=<handle> (lib/inviteSend.js), those links live in people's inboxes
// for 30 days, and the word "access" is the right word for the new page. Moving
// the invitation handler would break live links to save a rename; branching on
// the query breaks nothing and costs one `if`.
//
// WHAT THE MATRIX IS. Sam's rulings, grill of 2026-08-13:
//   - one row per grant, account by mineral, devices collapsed into a count
//   - a control panel, not a report: revoke and invite both fire from here
//   - a member sees only their own access; owners see the whole roster
//   - the list renders from the MIRROR, instantly, and never blocks on a
//     sleeping box. Live calls happen when you ACT, which is when it matters.
// The last one is why nothing on this page fans out to boxes on render: the
// staleness stamp says how old the mirror is, and acting is what goes live.
const { requireAuth } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml, renderTime } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');
const { holderIndex, hashEmail, freshnessChip } = require('../../lib/mineralView');
const { buildRows, summarise } = require('../../lib/accessMatrix');
const { mintAppToken } = require('../../lib/appAuth');
const renderInvitation = require('../../lib/invitationPage');

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

const STYLE = `
  .mineralblock{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:1em;overflow:hidden}
  .mineralhead{padding:.9em 1.1em;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:.6em;align-items:baseline}
  .mineralhead h2{font-size:1.05em;margin:0}
  .mineralhead .sub{color:var(--soft);font-size:.9em}
  .grantrow{padding:.8em 1.1em;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:.7em;align-items:center}
  .grantrow:last-child{border-bottom:none}
  .grantwho{flex:1 1 16em;min-width:12em;word-break:break-word}
  .grantwho b{font-weight:600}
  .grantwho .sub{color:var(--soft);font-size:.88em}
  .unresolved{color:var(--faint);font-style:italic}
  details.machines{font-size:.9em;color:var(--soft)}
  details.machines summary{cursor:pointer}
  details.machines ul{margin:.45em 0 0;padding:0;list-style:none}
  details.machines li{margin:.15em 0;display:flex;gap:.6em;align-items:center;flex-wrap:wrap}
  details.machines li .mach{flex:1 1 14em}
  .door{padding:.7em 1.1em;border-top:1px solid var(--line);color:var(--soft);font-size:.9em}
  .door b{color:var(--ink)}
  form.inline{display:inline}
  form.inline button{background:none;border:1px solid var(--line);border-radius:8px;padding:.35em .7em;
    color:var(--soft);font:inherit;font-size:.85em;cursor:pointer}
  form.inline button:hover{border-color:var(--bad);color:var(--bad)}
  .invite{display:flex;flex-wrap:wrap;gap:.5em;padding:.8em 1.1em;background:var(--card-2);align-items:center}
  .invite input[type=email]{flex:1 1 16em;padding:.55em .7em;border:1px solid var(--line);border-radius:8px;
    background:var(--card);color:var(--ink);font:inherit;font-size:.92em}
  .invite .note{margin:0;flex:1 1 100%}
  .summary{color:var(--soft);margin-bottom:1.3em;font-size:.95em}
`;

/** One person's row inside a mineral block. */
function renderGrantRow(row) {
  const who = row.who.resolved
    ? `<b>${escapeHtml(row.who.label)}</b>`
    : `<span class="unresolved">${escapeHtml(row.who.label)}</span>`;

  const chips = [];
  if (row.isHolder) chips.push('<span class="chip good">holds it</span>');
  // "can invite people" rather than "can manage it" (2026-08-14). The old chip
  // read on `owner`, a role no path could actually produce, and promised a
  // vaguer power than the one an admin has. Sam's ruling: an admin can invite
  // new people and a member cannot, and that is the ONLY difference, so the chip
  // says that and nothing wider.
  else if (row.role === 'admin') chips.push('<span class="chip">can invite people</span>');
  if (row.status === 'pending') chips.push('<span class="chip warn">invited, not accepted</span>');

  // "not shown to you" and "none" are different facts and the page must never
  // render the first as the second. A plain member has no business seeing the
  // roster, and saying that plainly beats an empty list that reads as "you are
  // the only one here".
  let machines;
  if (row.rosterHidden) {
    machines = '<div class="sub">Only the holder of this mineral can see its full roster.</div>';
  } else if (!Array.isArray(row.devices) || !row.devices.length) {
    machines = row.status === 'pending'
      ? '<div class="sub">No machines yet, because the invitation is still open.</div>'
      : '<div class="sub">No machines enrolled.</div>';
  } else {
    // WRITABLE NOW (Sam's ruling, 2026-08-13: fold Devices into Access and
    // delete the page). It was read-only on the reasoning that per-machine
    // removal belonged on the machine-shaped page. There is no longer a
    // machine-shaped page, so this is where a machine's key gets removed, one
    // mineral at a time — which is the shape Sam kept, because it is the only
    // one that expresses "this laptop keeps my rock but loses the client's
    // pebble".
    const items = row.devices.map((d) => {
      // A MACHINE THAT HAS NEVER REPORTED SAYS NOTHING (2026-08-13). This used
      // to read "never seen" on every row on every account, forever, because
      // last_seen had no writer at all. It has one now, but only on newly
      // provisioned boxes, so absence stays common and stays honest: no line
      // beats a false one.
      const seen = d.last_seen ? `<span class="sub"> &middot; last opened ${renderTime(d.last_seen)}</span>` : '';
      const vault = d.vault ? '<span class="chip">can open sealed secrets</span>' : '';
      const removing = row.pendingRemovals.has(d.slug);
      const act = removing
        ? '<span class="sub">Removing&#8230;</span>'
        : `<form class="inline" method="POST" action="/api/app/device-remove"
             onsubmit="return confirm('Remove ${escapeHtml(d.label || d.slug)} from ${escapeHtml(row.mineral.name)}? The mineral applies this itself, usually within a couple of minutes.')">
             <input type="hidden" name="mineral_id" value="${escapeHtml(row.mineral.mineral_id)}">
             <input type="hidden" name="slug" value="${escapeHtml(d.slug)}">
             <button type="submit">Remove</button>
           </form>`;
      return `<li><span class="mach">${escapeHtml(d.label || d.slug)}${seen} ${vault}</span>${row.canRemoveMachines ? act : ''}</li>`;
    }).join('');
    machines = `<details class="machines"><summary>${row.devices.length} machine${row.devices.length === 1 ? '' : 's'}</summary><ul>${items}</ul></details>`;
  }

  // Revoke is the holder's act alone. An owner-role grant can read every row
  // here and change none of them, which is what /grant-request enforces, so the
  // button is absent rather than present-and-doomed.
  const action = row.canRemoveAccess && row.grantEmail
    ? `<form class="inline" method="POST" action="/app/access">
         <input type="hidden" name="do" value="revoke">
         <input type="hidden" name="mineral_id" value="${escapeHtml(row.mineral.mineral_id)}">
         <input type="hidden" name="email" value="${escapeHtml(row.grantEmail)}">
         <button type="submit">Remove access</button>
       </form>`
    : '';

  return `<div class="grantrow">
    <div class="grantwho">${who}<div class="chips">${chips.join('')}</div></div>
    <div class="grantwho">${machines}</div>
    <div>${action}</div>
  </div>`;
}

/**
 * The two things that open a box and are neither a machine nor a person: the key
 * seeded at its birth, and a time-boxed Crads support grant.
 *
 * These had a whole section and a card each on the Devices page, which meant
 * three minerals produced three cards saying "Crads support: off". They are one
 * line per mineral now, on the mineral they belong to. Support still renders
 * when it is OFF, because an explicit off is a fact and an absent row is a
 * question — that ruling stands, it just does not need a card to say it.
 */
function renderDoor(mineral) {
  const door = mineral.door;
  if (!door) return '';
  const bits = [];
  for (const f of door.founders || []) {
    if (f && f.name) bits.push(`<b>${escapeHtml(f.name)}</b>, made when this was born`);
  }
  const s = door.support;
  if (s && s.active) bits.push(`<b>Crads support</b>, until ${renderTime(s.expires_at)}`);
  if (!bits.length && !s) return '';
  // Support OFF is stated separately and quietly. It is a fact worth having (an
  // absent row is a question), but it is the permanent default, and giving the
  // permanent default the same weight as a live key is how a page fills up with
  // things that never change. One clause, not a card per mineral.
  const off = s && !s.active ? '<span class="sub"> Crads support is off, and cannot be turned on except by you.</span>' : '';
  if (!bits.length) return `<div class="door">${off}</div>`;
  return `<div class="door">Also opens it: ${bits.join(' &middot; ')}. <span class="sub">Keys like these are removed on the mineral itself, not here.</span>${off}</div>`;
}

function renderMatrix(rows, { canInviteTo }) {
  const byMineral = new Map();
  for (const r of rows) {
    const k = r.mineral.mineral_id || r.mineral.name;
    if (!byMineral.has(k)) byMineral.set(k, { mineral: r.mineral, rows: [] });
    byMineral.get(k).rows.push(r);
  }
  let html = '';
  for (const { mineral, rows: rs } of byMineral.values()) {
    const stale = freshnessChip(mineral.updated);
    // Inviting needs a mineral_id, and a mineral that has never reported has no
    // mirror record to stage against. Offering the box anyway would be a form
    // that 404s on submit.
    const invite = canInviteTo.has(mineral.mineral_id) && mineral.mineral_id
      ? `<form class="invite" method="POST" action="/app/access">
           <input type="hidden" name="do" value="invite">
           <input type="hidden" name="mineral_id" value="${escapeHtml(mineral.mineral_id)}">
           <input type="email" name="email" placeholder="their email address" required>
           <select name="role" aria-label="What they can do">
             <option value="member">Can read it</option>
             <option value="admin">Can read it and invite others</option>
           </select>
           <button class="act" type="submit">Give access</button>
           <p class="note">They get a link. It only works when they sign in with this exact address, so a forwarded link is worthless to whoever receives it. An admin can invite and remove other people; that is the only thing the two choices change.</p>
         </form>`
      : '';
    html += `<div class="mineralblock">
      <div class="mineralhead">
        <h2>${escapeHtml(mineral.name)}</h2>
        <span class="sub">${escapeHtml(mineral.tier)}${mineral.host ? ` &middot; ${escapeHtml(mineral.host)}` : ''}</span>
        ${stale ? `<span class="chips">${stale}</span>` : ''}
      </div>
      ${rs.map(renderGrantRow).join('')}
      ${renderDoor(mineral)}
      ${invite}
    </div>`;
  }
  return html;
}

// Form posts arrive as a raw urlencoded stream unless something upstream has
// already parsed them. Same helper as api/app/device-remove.js, and the same
// 10KB bail: nothing here is ever bigger than an email address.
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

/** The POST arms. Both are live calls to the mineral, which is Sam's ruling: the
 * list is mirror-only, and acting is what goes live. */
async function act(req, res, user) {
  const dir = directoryFor(user);
  const body = await parseBody(req);
  const what = String(body.do || '');
  const mineralId = String(body.mineral_id || '');
  const email = String(body.email || '').trim().toLowerCase();

  // VALIDATED HERE, not trusted from the form (2026-08-14): a select is a
  // suggestion, and this decides whether somebody can widen who reaches a box.
  // The two names are the box's own (grants.mjs ROLES), so nothing is translated
  // on the way down; translating it is how the role got lost in five places.
  const role = body.role === 'admin' ? 'admin' : 'member';

  let flash;
  if (what === 'invite') {
    if (!EMAIL_RE.test(email)) flash = { bad: true, msg: 'That does not look like an email address.' };
    else {
      const r = await dir.grantAccess(mineralId, email, role);
      if (!r.ok) flash = { bad: true, msg: `That could not be staged: ${r.reason}` };
      else {
        // Remember WHO was invited, so the pending row can name them. The
        // directory holds only the hash by design, and until this landed the
        // owner's own outstanding invitation rendered as "an account not on this
        // site". Best-effort: a failed hint must never fail the invitation.
        try {
          const kvw = defaultKv();
          if (typeof kvw.setInvite === 'function') await kvw.setInvite(mineralId, hashEmail(email), { email, at: Date.now(), by: user.email });
        } catch { /* the grant is real either way; this only affects a label */ }
        // THE EMAIL IS BEST-EFFORT AND THE GRANT IS NOT. A failed send must
        // never read as a failed invitation: the access is real either way, and
        // the link can be carried by hand.
        const sent = await sendInvite({ user, email, mineralId, dir }).catch((e) => ({ sent: false, why: String(e && e.message || e) }));
        flash = sent.sent
          ? { msg: `Invitation sent to ${email}. Their access opens once they sign in with that address.` }
          : { msg: `${email} has been given access, but the email did not go out (${sent.why}). Send them this link yourself: ${sent.link}` };
      }
    }
  } else if (what === 'revoke') {
    if (!EMAIL_RE.test(email)) flash = { bad: true, msg: 'That does not look like an email address.' };
    else {
      const r = await dir.revokeGrant(mineralId, email);
      flash = r.ok
        ? { msg: `${email} is being removed. The mineral applies it itself, usually within a couple of minutes.` }
        : { bad: true, msg: `That could not be staged: ${r.reason}` };
    }
  }
  // POST-redirect-GET, with the outcome carried in the query rather than in a
  // session: a reload must not re-fire a custody act.
  const q = flash ? `?msg=${encodeURIComponent(flash.msg)}${flash.bad ? '&bad=1' : ''}` : '';
  res.statusCode = 303;
  res.setHeader('Location', `/app/access${q}`);
  return res.end();
}

/**
 * Send the invitation. The site owns the sender (Sam's ruling 2026-08-12: an
 * invitation is a platform account action), and this calls the same text and
 * link builder the directory-relayed path uses, so the two can never drift into
 * two different messages landing in two different inboxes.
 */
async function sendInvite({ user, email, mineralId, dir }) {
  const { inviteText, accessLink } = require('../../lib/inviteSend');
  const { AUTH_FROM } = require('../../lib/email');
  const r = await dir.minerals();
  const m = r.ok ? (r.minerals || []).find((x) => x.mineral_id === mineralId) : null;
  // The HANDLE it registered, which the worker now resolves for us. Chopping
  // the host was wrong: the two are independent and already differ on the live
  // fleet, and an invitation link built on the wrong one lands on a page that
  // says the community does not exist.
  const org = String((m && m.org) || (m && m.host) || '').split('.')[0].toLowerCase();
  const link = accessLink(org);
  if (!org) return { sent: false, why: 'this mineral has no address yet', link };
  if (!process.env.RESEND_API_KEY) return { sent: false, why: 'the mail sender is not configured', link };
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: AUTH_FROM,
    to: email,
    subject: `You have been given access to ${(m && m.label) || org}`,
    text: inviteText({ org, orgDisplay: (m && m.label) || org, inviterName: user.name || user.email, link }),
  });
  if (result && result.error) return { sent: false, why: String(result.error.message || 'the mail service refused it'), link };
  return { sent: true, link };
}

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;

  // The invitation link keeps this route. Checked before anything else so a
  // person clicking a link never pays for the matrix's reads.
  const org = String((req.query && req.query.org) || '').trim().toLowerCase();
  if (org) return renderInvitation(req, res, user, org);

  if (req.method === 'POST') return act(req, res, user);

  const dir = directoryFor(user);
  const [minR, users, invites] = await Promise.all([
    (typeof dir.minerals === 'function' ? dir.minerals() : Promise.resolve({ ok: false, reason: 'unreadable' }))
      .catch((e) => ({ ok: false, reason: String(e && e.message || e) })),
    kv.listUsers().catch(() => []),
    (typeof kv.listInvites === 'function' ? kv.listInvites() : Promise.resolve([])).catch(() => []),
  ]);

  const msg = String((req.query && req.query.msg) || '').slice(0, 400);
  const bad = !!(req.query && req.query.bad);

  let main = `<style>${STYLE}</style>
<h1>Access</h1>
<p class="lead">Who and what can reach your minerals, and the place you change it. Shown from the last report each mineral sent; removing or giving access asks the mineral itself.</p>
<p class="note">Removing an <b>account</b> cuts them off entirely, and every machine they enrolled with it. Removing a single <b>machine</b> takes away one computer&#8217;s key and leaves their access alone.</p>`;

  if (msg) {
    main += bad
      ? `<div class="problem"><b>${escapeHtml(msg)}</b></div>`
      : `<div class="card"><b>${escapeHtml(msg)}</b></div>`;
  }

  if (!minR.ok) {
    main += `<div class="problem"><b>Could not read your access just now.</b>
      <div class="note">${escapeHtml(minR.reason)}. Nothing has changed about who can reach your minerals; this page could not ask.</div></div>`;
  } else {
    const byHash = holderIndex(users);
    const me = { hash: hashEmail(user.email), id: user.id || '', email: user.email };
    const inviteHints = new Map((invites || []).map((i) => [`${i.mineral_id}:${i.hash}`, i.email]));
    const rows = buildRows({ minerals: minR.minerals, byHash, me, invites: inviteHints });
    // Minerals this account holds OR is an admin on can take a new grant, which
    // is what /grant-request now lets past and what the mineral re-checks on its
    // own disk. Deriving the set here keeps the form off every row the worker
    // would refuse; it was holder-only until 2026-08-14, when Sam ruled that
    // inviting people is the one thing an admin can do that a member cannot.
    //
    // Pending admins are excluded here for the same reason the other two gates
    // exclude them: an invitation nobody has accepted is not a permission.
    const canInviteTo = new Set(
      (minR.minerals || []).filter((m) => m.mineral_id && (
        m.held_by === 'you'
        || (Array.isArray(m.access) && m.access.some((g) => g
          && g.role === 'admin' && g.status !== 'pending'
          && ((g.e && g.e === me.hash) || (g.account_id && me.id && g.account_id === me.id))))
      )).map((m) => m.mineral_id),
    );

    if (!rows.length) {
      main += `<div class="empty"><b>Nothing reaches this account yet.</b>
        <p class="note">A row appears here as soon as a mineral records this account as its holder, or gives it access.</p></div>`;
    } else {
      const s = summarise(rows);
      const bits = [
        `${s.minerals} mineral${s.minerals === 1 ? '' : 's'}`,
        `${s.people} account${s.people === 1 ? '' : 's'}`,
        `${s.machines} machine${s.machines === 1 ? '' : 's'}`,
      ];
      if (s.pending) bits.push(`${s.pending} invitation${s.pending === 1 ? '' : 's'} outstanding`);
      if (s.dark) bits.push(`${s.dark} not reporting`);
      main += `<p class="summary">${escapeHtml(bits.join(' &middot; ').replace(/&middot;/g, '·'))}</p>`;
      main += renderMatrix(rows, { canInviteTo });
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Access', active: 'access', email: user.email, isAdmin: isAdmin(user.email), main }));
};
module.exports.sendInvite = sendInvite;
