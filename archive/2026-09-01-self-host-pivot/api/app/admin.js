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
  const rows = minerals.map((m) => `<tr id="m-${escapeHtml(String(m.mineral_id || '').slice(0, 16))}">
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

// ---- 4. TOPOLOGY: the shape of the fleet, drawn ----------------------------
//
// Sam's ask (2026-08-17, grilled then revised the same evening): a widget on
// THIS page, a card tree with lines, nowhere near the sandbox. Directory lens
// only (ai-os spec 2026-08-17-operator-topology-directory-lens): what the
// registry knows, gaps render as gaps. Edge truth belongs to edges-reflect,
// and its heartbeat is worn on every rock card: stale or absent IS the alarm.
// One health fact per card, the enrol-sync tick (mineral.updated, <=5m = on).
const hostLabel = (h) => String(h || '').split('.')[0];
const humanizeSlug = (s) => String(s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function topoModel(t) {
  const nodes = new Map();
  const rocks = new Map();
  for (const m of t.minerals || []) {
    const id = m.tier === 'rock' ? (m.org || hostLabel(m.host) || m.mineral_id) : (hostLabel(m.host) || m.mineral_id);
    const n = { id, m, kids: [], joins: [], parent: null, rel: '' };
    nodes.set(id, n);
    if (m.tier === 'rock') rocks.set(m.org || id, n);
  }
  // A route with no mineral record still renders: the registry asserts the
  // org exists, and hiding a half-known thing defeats an existence audit.
  for (const o of t.orgs || []) {
    if (rocks.has(o)) continue;
    const n = { id: o, m: null, kids: [], joins: [], parent: null, rel: '', routeOnly: true };
    nodes.set(o, n); rocks.set(o, n);
  }
  const ties = (t.edges || []).filter((e) => e && e.role === 'member' && e.status !== 'left');
  for (const n of nodes.values()) {
    const anchor = n.m && n.m.anchor && rocks.has(n.m.anchor) && n.m.anchor !== n.id ? n.m.anchor : '';
    const joined = [...new Set(ties.filter((e) => e.slug === n.id).map((e) => e.org))]
      .filter((o) => rocks.has(o) && o !== n.id && o !== anchor);
    if (anchor) { n.parent = anchor; n.rel = 'anchored'; n.joins = joined; }
    else if (joined.length) { n.parent = joined[0]; n.rel = 'joined'; n.joins = joined.slice(1); }
  }
  for (const n of nodes.values()) { const p = n.parent && nodes.get(n.parent); if (p) p.kids.push(n); }
  const roots = [...nodes.values()].filter((n) => !(n.parent && nodes.get(n.parent)));
  const sortKids = (arr) => { arr.sort((a, b) => (b.kids.length - a.kids.length) || String(a.id).localeCompare(String(b.id))); arr.forEach((k) => sortKids(k.kids)); };
  sortKids(roots);
  return { roots, ties };
}

// The chart is a real flowchart (Sam's revision of the revision, same night:
// "more of a flow charty vision"): absolutely-positioned cards over one SVG
// layer of drawn connectors. Layout is the classic tidy-tree measure/place —
// a subtree is as wide as its children, a node sits centred over its own —
// done server-side so the page ships finished, no client JS.
const TN = { W: 208, H: 104, HG: 30, VG: 64 };

function layoutTopo(roots) {
  const w = new Map(), pos = new Map();
  let maxDepth = 0;
  const measure = (n) => {
    const kw = n.kids.map(measure);
    const width = Math.max(TN.W, kw.reduce((s, x) => s + x, 0) + TN.HG * Math.max(0, n.kids.length - 1));
    w.set(n, width); return width;
  };
  roots.forEach(measure);
  const place = (n, left, depth) => {
    maxDepth = Math.max(maxDepth, depth);
    pos.set(n, { x: Math.round(left + w.get(n) / 2 - TN.W / 2), y: depth * (TN.H + TN.VG) });
    let x = left;
    n.kids.forEach((k) => { place(k, x, depth + 1); x += w.get(k) + TN.HG; });
  };
  let x = 0;
  roots.forEach((r) => { place(r, x, 0); x += w.get(r) + TN.HG; });
  return { pos, W: Math.max(x - TN.HG, TN.W), H: (maxDepth + 1) * (TN.H + TN.VG) - TN.VG };
}

function topoCardInner(n, { reflect, now }) {
  if (n.routeOnly) {
    return `<span class="tname">${escapeHtml(humanizeSlug(n.id))}</span>
      <span class="thandle" title="${escapeHtml(n.id)}">${escapeHtml(n.id)}</span>
      <span class="tsub">a community route with no mineral record</span>`;
  }
  const m = n.m;
  const isRock = m.tier === 'rock';
  const handle = isRock ? (m.org || hostLabel(m.host)) : hostLabel(m.host);
  const live = (Number(m.updated) || 0) > 0 && (now - m.updated) <= 5 * 60 * 1000;
  const f = freshness(m.updated, now);
  const dotTitle = live ? 'reporting (enrol-sync ticks every 2 minutes)' : (f.words || 'quiet just now');
  let sub = '';
  if (isRock) {
    const at = reflect && reflect[m.org || n.id];
    if (!at) sub = '<span class="warntxt">edges never re-asserted</span>';
    else {
      const mins = Math.max(1, Math.round((now - at) / 60000));
      sub = mins > 45 ? `<span class="warntxt">edges re-asserted ${mins}m ago (rhythm 30m)</span>` : `edges re-asserted ${mins}m ago`;
    }
  }
  const chips = [`<span class="chip">${escapeHtml(m.tier || '')}</span>`]
    .concat(n.rel === 'joined' ? ['<span class="chip">joined</span>'] : []).join('');
  return `<span class="trow"><span class="tdot ${live ? 'on' : 'off'}" title="${escapeHtml(dotTitle)}"></span>
    <span class="tname">${escapeHtml(m.label || m.host || '(unnamed)')}</span></span>
    <span class="thandle" title="${escapeHtml(handle)}">${escapeHtml(handle)}</span>
    <span class="tchips">${chips}</span>
    ${sub ? `<span class="tsub">${sub}</span>` : ''}`;
}

const tieCurve = (x1, y1, x2, y2) => `M${x1} ${y1} C${x1} ${y1 + 30}, ${x2} ${y2 - 30}, ${x2} ${y2}`;

function topologyBlock(t, byHash, now = Date.now()) {
  const { roots, ties } = topoModel(t);
  const reserved = t.reserved || [];
  const rocksN = (t.minerals || []).filter((m) => m.tier === 'rock').length;
  const stamps = Object.values(t.reflect || {});
  const reflectWords = !rocksN ? '' : !stamps.length ? 'no reflect heartbeats yet'
    : `oldest reflect heartbeat ${Math.max(1, Math.round((now - Math.min(...stamps)) / 60000))}m ago`;
  let html = `<div class="topo-strip">${(t.minerals || []).length} minerals · ${ties.length} live tie${ties.length === 1 ? '' : 's'} · ${reserved.length} reserved${reflectWords ? ` · ${escapeHtml(reflectWords)}` : ''} · fetched live · <span class="tkey"><svg width="22" height="8" aria-hidden="true"><path d="M1 4h20" class="tie-anchored"/></svg> anchored</span> <span class="tkey"><svg width="22" height="8" aria-hidden="true"><path d="M1 4h20" class="tie-joined"/></svg> joined</span></div>`;
  if (!roots.length) return html + '<div class="topowrap"><p class="note">The directory mirrors no minerals yet.</p></div>';

  // flatten with positions
  const { pos, W, H } = layoutTopo(roots);
  const all = [];
  const walk = (n) => { all.push(n); n.kids.forEach(walk); };
  roots.forEach(walk);
  const byId = new Map(all.map((n) => [n.id, n]));

  // connectors: the primary tie (parent) solid-or-dashed by rel, every extra
  // join its own dashed curve — a flowchart can draw the DAG the tree elided
  let paths = '';
  for (const n of all) {
    const p = n.parent && byId.get(n.parent);
    const c = pos.get(n);
    if (p) {
      const pp = pos.get(p);
      paths += `<path class="tie-${n.rel === 'joined' ? 'joined' : 'anchored'}" d="${tieCurve(pp.x + TN.W / 2, pp.y + TN.H, c.x + TN.W / 2, c.y)}"/>`;
    }
    for (const j of n.joins || []) {
      const jp = byId.get(j) && pos.get(byId.get(j));
      if (jp) paths += `<path class="tie-joined" d="${tieCurve(jp.x + TN.W / 2, jp.y + TN.H, c.x + TN.W / 3, c.y)}"/>`;
    }
  }

  const cards = all.map((n) => {
    const c = pos.get(n);
    const style = `left:${c.x}px;top:${c.y}px;width:${TN.W}px;height:${TN.H}px`;
    const inner = topoCardInner(n, { reflect: t.reflect || {}, now });
    return n.routeOnly
      ? `<span class="tcard ghost" style="${style}">${inner}</span>`
      : `<a class="tcard" href="#m-${escapeHtml(String(n.m.mineral_id || '').slice(0, 16))}" style="${style}">${inner}</a>`;
  }).join('');

  html += `<div class="topowrap"><div class="tchart" style="width:${W}px;height:${H}px">
    <svg class="tlines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${paths}</svg>
    ${cards}</div>`;
  if (reserved.length) {
    html += `<div class="tres">${reserved.map((r) => {
      const till = r.expires_at ? `frees in ${Math.max(0, Math.ceil((r.expires_at - now) / 86400000))}d` : 'held until released';
      return `<span class="tcard resv"><span class="tname">${escapeHtml(r.display || humanizeSlug(r.org))}</span>
        <span class="thandle">${escapeHtml(r.org)}</span>
        <span class="tsub">reserved handle${r.promote ? ' · promote in flight' : ''} · ${escapeHtml(till)}</span></span>`;
    }).join('')}</div>`;
  }
  html += '</div>';
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

  const dir = directoryFor(user);
  const [dirR, dirT, users] = await Promise.all([
    dir.adminAll().catch((e) => ({ ok: false, reason: String(e && e.message || e) })),
    // async wrapper so a reader without adminTopology (older mock, older build)
    // rejects into the catch instead of throwing before a promise exists
    (async () => dir.adminTopology())().catch((e) => ({ ok: false, reason: String(e && e.message || e) })),
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
  .topo-strip{color:var(--soft);font-size:.9em;margin:.8em 0 .6em}
  .tkey{white-space:nowrap} .tkey svg{vertical-align:middle}
  .topowrap{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1.2em;margin:0 0 1.4em;overflow-x:auto}
  .tchart{position:relative;margin:0 auto}
  .tlines{position:absolute;inset:0;pointer-events:none}
  .tlines path,.tkey path{fill:none;stroke:var(--line);stroke-width:2}
  .tie-joined{stroke-dasharray:5 4}
  .tcard{position:absolute;display:flex;flex-direction:column;gap:.18em;box-sizing:border-box;
    border:1px solid var(--line);border-radius:10px;padding:.55em .8em;text-decoration:none;color:inherit;
    background:var(--card);overflow:hidden}
  a.tcard:hover{border-color:var(--soft)}
  .tcard.ghost,.tcard.resv{border-style:dashed;color:var(--soft)}
  .trow{display:flex;align-items:center;gap:.5em;min-width:0}
  .tname{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .thandle{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8em;color:var(--soft);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tsub{font-size:.78em;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .warntxt{color:var(--warn)}
  .tdot{width:.55em;height:.55em;border-radius:50%;flex:none}
  .tdot.on{background:var(--good,#2e9e5b)} .tdot.off{background:var(--line)}
  .tchips .chip{font-size:.72em;border:1px solid var(--line);border-radius:999px;padding:.08em .5em;color:var(--soft)}
  .tres{margin-top:1em;padding-top:.9em;border-top:1px dashed var(--line);display:flex;flex-wrap:wrap;gap:.6em}
  .tres .tcard{position:static;width:14em;height:auto}
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
<h2 class="sect">Topology</h2>
${dirT.ok ? topologyBlock(dirT, byHash) : `<p class="note">The topology could not be read: ${escapeHtml(dirT.reason || 'unknown')}. Everything below is unaffected.</p>`}
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
module.exports.topoModel = topoModel;
module.exports.topologyBlock = topologyBlock;
