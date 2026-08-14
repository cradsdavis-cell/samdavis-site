'use strict';
// /app/admin — the operator's universal view (V3, Sam's ask 2026-08-10 after
// the first live account walk): every mineral the directory mirrors, every
// legacy self-registration, every org route, and every ACCOUNT on this site.
//
// Two different sources, honestly labelled: minerals come from the directory
// (via an admin-scoped token the worker double-checks against the operator's
// email hash), accounts come from this site's own KV. Neither pretends to be
// the other; a mineral the directory has never heard of will not appear, and
// the page says so.
//
// A non-operator gets 404, not 403: this page's existence is nobody else's
// business.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { isAdmin } = require('../../lib/auth');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');
const { freshness, hashEmail } = require('../../lib/mineralView');
const { createHash } = require('node:crypto');

const fmtDate = (v) => {
  const n = typeof v === 'number' ? v : Date.parse(v || '');
  return Number.isFinite(n) ? `<time data-iso="${new Date(n).toISOString()}">${new Date(n).toISOString().slice(0, 10)}</time>` : '';
};

// The directory stores holders as a sha256 of the lowercased email, which is
// right: it is a public-ish mirror and it should not carry addresses. This page
// is not that. It is operator-only, and it renders every account's email in
// plain text in the table directly above this one, so refusing to name the
// holder here protects nobody and costs the operator the one fact they came for
// (QA finding 56: "Held by: an account (by email hash)" printed inches above the
// very hash, with the matching email inches above that).
//
// The hash is deterministic and the candidate set is the accounts already
// loaded, so this is a lookup, not a crack.
function holderIndex(users) {
  const byHash = new Map();
  for (const u of users) {
    const e = String(u.email || '').toLowerCase();
    if (e) byHash.set(createHash('sha256').update(e).digest('hex'), u.email);
  }
  return byHash;
}

function holderWords(h, byHash) {
  if (!h) return 'unclaimed';
  if (h.kind === 'org') return `the rock <b>${escapeHtml(h.org || '?')}</b>`;
  const named = h.e && byHash && byHash.get(String(h.e).toLowerCase());
  if (named) return `<b>${escapeHtml(named)}</b>`;
  // Still unresolved: say WHICH hash, so the operator can go and look rather
  // than being told only that an answer exists somewhere.
  if (h.e) return `An account not on this site <span class="sub">${escapeHtml(String(h.e).slice(0, 12))}…</span>`;
  return `an account (${escapeHtml(h.account_id ? h.account_id.slice(0, 12) + '…' : 'no identifier recorded')})`;
}

/**
 * Grants that are actually grants. claimOwner writes the holder into `access` at
 * birth with role owner, so every mineral ships with one row that is not a grant
 * to anybody: the live fleet showed "1 grant" on two rocks that had never been
 * shared with a soul. Counting it makes the operator's first question ("who has
 * this been given to?") answer wrong on every single mineral.
 */
function realGrants(m) {
  const hE = (m.holder && m.holder.e) || '';
  const hId = (m.holder && m.holder.account_id) || '';
  return (m.access || []).filter((g) => !((hE && g.e === hE) || (hId && g.account_id === hId)));
}

function mineralsTable(minerals, byHash) {
  if (!minerals.length) return '<p class="note">The directory mirrors no minerals yet.</p>';
  const rows = minerals.map((m) => `<tr>
    <td><b>${escapeHtml(m.label || m.host || '(unnamed)')}</b><div class="sub">${escapeHtml(m.host || '')}</div></td>
    <td>${escapeHtml(m.tier || '')}</td>
    <td>${escapeHtml(m.anchor || '')}</td>
    <td>${holderWords(m.holder, byHash)}</td>
    <td>${realGrants(m).length} grant${realGrants(m).length === 1 ? '' : 's'}</td>
    <td class="sub">${escapeHtml((m.mineral_id || '').slice(0, 16))}…</td>
    <td>${fmtDate(m.updated)}</td>
  </tr>`).join('');
  return `<div class="tablewrap"><table>
    <thead><tr><th>Mineral</th><th>Tier</th><th>Anchor</th><th>Held by</th><th>Access</th><th>Serial</th><th>Updated</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// LEGACY SELF-REGISTRATIONS AND ORG ROUTES ARE NOT RENDERED (Sam, 2026-08-13).
// Both were dropped from this page as noise, not as data. Nothing was deleted:
// /admin-minerals still returns `boxes` and `orgs`, and this handler still
// receives them, so restoring either is a render change and not a migration.
//
// Why they went. A `boxreg:` row is a claim a machine made about itself while
// holding a box token, and every box that has a mineral has one, saying the
// same thing the mineral already proves properly. On the live fleet the single
// legacy row and the single mineral were the same box, so the section's only
// content was a duplicate the page then had to caption as untrustworthy.
// Org routes went for the adjacent reason: the count reads as "how many orgs"
// and is not, because `crads-solo` is the standalone-pebble bucket rather than
// a rock, so "2" meant one real org for as long as the tile existed.
function accountsTable(users) {
  if (!users.length) return '<p class="note">No accounts.</p>';
  const rows = users
    .slice()
    .sort((a, b) => String(a.email).localeCompare(String(b.email)))
    .map((u) => `<tr>
      <td><b>${escapeHtml(u.email || '')}</b></td>
      <td class="sub">${escapeHtml(u.id || 'no id yet')}</td>
      <td>${escapeHtml(u.name || '')}</td>
      <td>${u.password_hash ? 'password' : ''}${u.password_hash && u.google_sub ? ' + ' : ''}${u.google_sub ? 'google' : ''}${!u.password_hash && !u.google_sub ? 'magic link' : ''}</td>
      <td>${fmtDate(u.created_at || u.created)}</td>
      <td>${escapeHtml(String(u.state_version || 1))}</td>
    </tr>`).join('');
  return `<div class="tablewrap"><table>
    <thead><tr><th>Email</th><th>Account id</th><th>Name</th><th>Signs in with</th><th>Created</th><th>State v</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// ---- 1. TRIAGE: what is broken or dark ------------------------------------
//
// Sam's ruling (grill round 3): triage first, then search, then totals, in that
// order, on one page. This block is the reason the page is worth opening at
// 07:00 rather than a table dump you have to read to find the problem in.
//
// Everything here is DERIVED, never stored: a triage board with its own state
// is a second source of truth about the fleet, and the fleet already has one.
function triage(minerals, byHash, now = Date.now()) {
  const items = [];
  for (const m of minerals) {
    const name = m.label || m.host || m.mineral_id || '(unnamed)';
    const f = freshness(m.updated, now);
    // Dark is the loudest thing on this page. enrol-sync re-registers every two
    // minutes, so a mineral that has not reported in a week is not quiet, it is
    // gone, off, broken or unreachable, and nobody would otherwise find out.
    if (f.level === 'dark') items.push({ sev: 'bad', what: `${name} is ${f.words}`, why: 'It re-registers every 2 minutes when it is up, so this is not quiet, it is not running' });
    else if (f.level === 'stale') items.push({ sev: 'warn', what: `${name} ${f.words}`, why: 'Expected every 2 minutes' });
    else if (f.level === 'unknown') items.push({ sev: 'warn', what: `${name} has never reported in`, why: 'Built but never came up, or came up before the mirror existed' });
    if (!m.holder) items.push({ sev: 'warn', what: `${name} is unclaimed`, why: 'No account holds it, so nobody can see it in their own app' });
    else if (m.holder.kind === 'account' && m.holder.e && !byHash.get(String(m.holder.e))) {
      items.push({ sev: 'warn', what: `${name} is held by an account not on this site`, why: 'They cannot sign in here, so they cannot manage it' });
    }
    // A ROCK WHOSE HANDLE IS NOT ITS HOST LABEL (2026-08-13). Legal, and a
    // trap: four separate code paths used to derive the handle by chopping the
    // host, so on a mismatched rock invitations could not activate, the SSH
    // host went missing from the app, and its events matched nothing. All four
    // are fixed, but the shape is worth seeing because anything written against
    // the old assumption is still out there, and because a rock with no handle
    // at all cannot be invited to.
    const hostLabel = String(m.host || '').split('.')[0].toLowerCase();
    if (m.tier === 'rock') {
      if (!m.org) items.push({ sev: 'warn', what: `${name} has not reported an org handle`, why: 'It is on an image older than 2026-08-13, or its org-policy.yaml has no name' });
      else if (m.org.toLowerCase() !== hostLabel) items.push({ sev: 'info', what: `${name} answers to "${m.org}" but lives at "${hostLabel}"`, why: 'Legal, and the reason anything that guesses a handle from a host gets this rock wrong' });
    }
    const pending = realGrants(m).filter((g) => g && g.status === 'pending');
    if (pending.length) items.push({ sev: 'info', what: `${name} has ${pending.length} invitation${pending.length === 1 ? '' : 's'} outstanding`, why: 'Sent, not yet accepted' });
  }
  const order = { bad: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.sev] - order[b.sev]);
}

function triageBlock(items) {
  if (!items.length) {
    return `<div class="empty"><b>Nothing needs attention.</b>
      <p class="note">Every mirrored mineral is reporting, held by a known account, with no invitation left hanging.</p></div>`;
  }
  const rows = items.map((i) => `<div class="triage ${escapeHtml(i.sev)}">
    <b>${escapeHtml(i.what)}</b><div class="sub">${escapeHtml(i.why)}</div></div>`).join('');
  return `<div class="triagewrap">${rows}</div>`;
}

// ---- 2. SEARCH: one subject, everything about it --------------------------
//
// The support-shaped question, and the one that will actually be needed on
// cohort-one day: somebody says "I cannot get in" and the operator needs every
// fact about them in one place rather than four tables to cross-reference by eye.
function searchAll({ q, users, minerals, byHash }) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return null;
  const hit = { query: needle, accounts: [], minerals: [] };
  const nHash = hashEmail(needle);

  hit.accounts = users.filter((u) => String(u.email || '').toLowerCase().includes(needle)
    || String(u.id || '').toLowerCase() === needle);

  hit.minerals = minerals.filter((m) => {
    const text = `${m.label || ''} ${m.host || ''} ${m.anchor || ''} ${m.mineral_id || ''}`.toLowerCase();
    if (text.includes(needle)) return true;
    // by the PERSON: held by them, or granted to them. This is the arm that
    // makes an email address a useful thing to type in.
    if (m.holder && m.holder.e === nHash) return true;
    if (m.holder && m.holder.kind === 'org' && String(m.holder.org || '').toLowerCase().includes(needle)) return true;
    return (m.access || []).some((g) => g && (g.e === nHash
      || (g.account_id && hit.accounts.some((u) => u.id === g.account_id))));
  });

  return hit;
}

function searchBlock(hit, byHash) {
  if (!hit) {
    return `<form method="GET" class="search">
      <input type="search" name="q" placeholder="an email address, a slug, a host or a serial" aria-label="Search">
      <button class="act" type="submit">Search</button>
    </form>`;
  }
  let html = `<form method="GET" class="search">
    <input type="search" name="q" value="${escapeHtml(hit.query)}" aria-label="Search">
    <button class="act" type="submit">Search</button>
    <a class="act quiet" href="/app/admin">Clear</a>
  </form>`;
  const total = hit.accounts.length + hit.minerals.length;
  if (!total) {
    return `${html}<div class="empty"><b>Nothing matches &ldquo;${escapeHtml(hit.query)}&rdquo;.</b>
      <p class="note">Accounts match on email or id; minerals on name, host, anchor, serial, holder or grantee.</p></div>`;
  }
  if (hit.accounts.length) html += `<h3 class="sect">Accounts (${hit.accounts.length})</h3>${accountsTable(hit.accounts)}`;
  if (hit.minerals.length) {
    html += `<h3 class="sect">Minerals (${hit.minerals.length})</h3>${mineralsTable(hit.minerals, byHash)}`;
    // the grants themselves, spelled out: the minerals table only counts them,
    // and "3 grants" is not an answer to "can this person get in"
    for (const m of hit.minerals) {
      const gs = realGrants(m);
      if (!gs.length) continue;
      const rows = gs.map((g) => {
        const who = (g.account_id && byHash.get(String(g.account_id))) || (g.e && byHash.get(String(g.e)));
        return `<li>${who ? `<b>${escapeHtml(who.email)}</b>` : `<span class="sub">An account not on this site (${escapeHtml(String(g.e || g.account_id || '').slice(0, 12))}…)</span>`}
          &middot; ${escapeHtml(g.role || 'user')}${g.status === 'pending' ? ' &middot; <b>invited, not accepted</b>' : ''}</li>`;
      }).join('');
      html += `<p class="note"><b>${escapeHtml(m.label || m.host || 'mineral')}</b> grants:</p><ul class="grants">${rows}</ul>`;
    }
  }
  return html;
}

// ---- 3. TOTALS ------------------------------------------------------------
function totalsBlock(minerals, users) {
  const rocks = minerals.filter((m) => m.tier === 'rock').length;
  const pebbles = minerals.length - rocks;
  const grants = minerals.reduce((n, m) => n + realGrants(m).length, 0);
  const pending = minerals.reduce((n, m) => n + realGrants(m).filter((g) => g && g.status === 'pending').length, 0);
  const machines = minerals.reduce((n, m) => n + (m.devices || []).filter((d) => d && d.status !== 'revoked').length, 0);
  const cells = [
    ['Accounts', users.length], ['Rocks', rocks], ['Pebbles', pebbles],
    ['Grants', grants], ['Invitations open', pending],
    ['Machines enrolled', machines],
  ];
  return `<div class="totals">${cells.map(([k, v]) => `<div><b>${v}</b><span>${escapeHtml(k)}</span></div>`).join('')}</div>`;
}

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;
  if (!isAdmin(user.email)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send('Not found');
  }

  const [dirR, users] = await Promise.all([
    directoryFor(user).adminAll().catch((e) => ({ ok: false, reason: String(e && e.message || e) })),
    kv.listUsers().catch(() => []),
  ]);

  // Built once from the accounts just loaded, and handed to every block that
  // holds a hash. None of them should be doing crypto inline.
  const byHash = holderIndex(users);
  const q = String((req.query && req.query.q) || '').slice(0, 120);

  let main = `<h1>Operator</h1>
<p class="lead">What is broken, who is who, and what the platform adds up to. Operator only.</p>
<style>
  .tablewrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;margin:.8em 0 1.4em}
  table{border-collapse:collapse;width:100%;font-size:.92em}
  th{text-align:left;padding:.55em .8em;border-bottom:1px solid var(--line);color:var(--soft);font-weight:600;white-space:nowrap}
  td{padding:.55em .8em;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:none}
  .sect{margin-top:1.4em;font-size:1.05em}
  .triagewrap{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden;margin:.8em 0 1.4em}
  .triage{padding:.7em 1.1em;border-bottom:1px solid var(--line);border-left:3px solid transparent}
  .triage:last-child{border-bottom:none}
  .triage.bad{border-left-color:var(--bad)} .triage.warn{border-left-color:var(--warn)} .triage.info{border-left-color:var(--line)}
  .triage .sub{color:var(--soft);font-size:.88em}
  .search{display:flex;gap:.5em;flex-wrap:wrap;margin:.8em 0 1.2em;align-items:center}
  .search input{flex:1 1 22em;padding:.6em .8em;border:1px solid var(--line);border-radius:9px;
    background:var(--card);color:var(--ink);font:inherit}
  .totals{display:flex;flex-wrap:wrap;gap:.7em;margin:.8em 0 1.4em}
  .totals div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.8em 1.1em;min-width:8em}
  .totals b{display:block;font-size:1.5em;line-height:1.1}
  .totals span{color:var(--soft);font-size:.85em}
  ul.grants{margin:.3em 0 1em 1.2em;padding:0;font-size:.92em}
  ul.grants li{margin:.2em 0}
</style>`;

  if (!dirR.ok) {
    main += `<div class="problem"><b>The directory could not be read.</b>
      <div class="note">${escapeHtml(dirR.reason)}. The accounts below are this site's own and are complete; every mineral-shaped block on this page is missing, not empty.</div></div>
<h2 class="sect">Accounts (${users.length})</h2>
${accountsTable(users)}`;
  } else {
    const items = triage(dirR.minerals, byHash);
    const hit = searchAll({ q, users, minerals: dirR.minerals, byHash });
    main += `<h2 class="sect">Needs attention (${items.length})</h2>
${triageBlock(items)}
<h2 class="sect">Find anything</h2>
${searchBlock(hit, byHash)}
<h2 class="sect">Totals</h2>
${totalsBlock(dirR.minerals, users)}
<h2 class="sect">Accounts (${users.length})</h2>
${accountsTable(users)}
<h2 class="sect">Minerals (${dirR.minerals.length})</h2>
${mineralsTable(dirR.minerals, byHash)}`;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Operator', active: 'admin', email: user.email, isAdmin: true, main }));
};
module.exports.triage = triage;
module.exports.searchAll = searchAll;
