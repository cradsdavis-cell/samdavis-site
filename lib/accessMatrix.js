'use strict';
// lib/accessMatrix.js — the rows behind /app/access (2026-08-13).
//
// Sam's ruling, round 3 of the grill: ONE ROW PER GRANT, account by mineral,
// with devices collapsed into a count. Not one row per device (a person with
// three machines would appear three times), and not a grid of people against
// minerals (unreadable past about eight minerals).
//
// WHAT A ROW IS ALLOWED TO SAY. Sam's ruling, round 2: a member sees only their
// own access. So the row set depends on who is asking:
//   - a mineral you HOLD, or have owner-role over: every grant on it, named
//   - a mineral merely shared with you: exactly one row, yours
// This is not cosmetic filtering. The directory only sends the access roster to
// holders and owner-role grants in the first place (/my-minerals), so for a
// plain member the data to build anybody else's row never arrives.
//
// The separation of concerns here matters for the tests: this file turns two
// directory reads plus the site's account list into rows and says nothing about
// HTML. api/app/access.js renders them and owns the actions.

const { nameGrantee, freshness } = require('./mineralView');

const CONTAINER_ID = /^[0-9a-f]{12}$/;

/** The same naming rule the minerals page uses: an address is not a name. */
function displayName(m) {
  const label = String(m && m.label || '').trim();
  if (label) return label;
  const host = String(m && m.host || '').trim();
  if (host && !CONTAINER_ID.test(host.split('.')[0])) return host.split('.')[0];
  if (m && m.tier === 'rock' && m.anchor && m.anchor !== 'crads-ai') return m.anchor;
  return m && m.tier === 'rock' ? 'an unnamed rock' : 'an unnamed pebble';
}

/**
 * Build the matrix.
 *
 * @param {object[]} minerals  /my-minerals rows (access + devices present only
 *                             where the caller may see them)
 * @param {Map} byHash         hash/id -> {email} from the site's own accounts
 * @param {object} me          { hash, id, email } of the reader
 * @returns {object[]} one row per (mineral, grantee), plus a holder row
 */
function buildRows({ minerals = [], byHash = new Map(), me = {}, invites = new Map() } = {}) {
  const rows = [];
  for (const m of minerals) {
    // The other two things that open this box, which are not machines and not
    // people: the key seeded at its birth, and a time-boxed Crads support grant.
    // They used to live on the Devices page; with that page gone they belong to
    // the mineral they open.
    const door = m.door && typeof m.door === 'object' ? m.door : null;
    const mineral = {
      mineral_id: m.mineral_id || '',
      name: displayName(m),
      host: m.host || '',
      tier: m.tier || 'pebble',
      updated: m.updated || 0,
      freshness: freshness(m.updated || 0),
      door,
    };
    const iHold = m.held_by === 'you';
    // AM I AN ADMIN HERE? (2026-08-14). Sam's ruling: an admin can invite new
    // people and a member cannot, and that is the only difference between the
    // two roles. So this, with iHold, is what decides whether the page offers
    // the invite form and the remove buttons at all.
    //
    // PENDING excluded: an invitation nobody has accepted is not a permission,
    // which is the same line /grant-request and the mineral both draw. Rendering
    // a control the box would refuse is the failure this flag exists to avoid.
    const iAmAdmin = Array.isArray(m.access) && m.access.some((g) => g
      && g.role === 'admin' && g.status !== 'pending'
      && ((me.hash && g.e === me.hash) || (me.id && g.account_id === me.id)));
    // Two names for one rule, so the call sites read as what they mean.
    const iCanShare = iHold || iAmAdmin;
    // Removals the mineral has been asked for and has not applied yet. Without
    // this a Remove click reloads an unchanged list and reads as a button that
    // did nothing, for the two minutes the mineral takes to decide.
    const pendingRemovals = new Set(m.pending_removals || []);
    // The roster only arrives for holders and owner-role grants. Its ABSENCE is
    // the signal that this account is a plain member, and the honest row for
    // that case is one row saying so, never an empty table implying nobody else
    // is here.
    const canSeeRoster = Array.isArray(m.access);
    const devices = Array.isArray(m.devices) ? m.devices.filter((d) => d && d.status !== 'revoked') : null;

    if (!canSeeRoster) {
      rows.push({
        mineral,
        who: { label: 'you', resolved: true, isMe: true },
        role: m.role || 'user',
        status: 'active',
        isHolder: false,
        heldBy: m.held_by || '',
        devices: null,               // null means "not shown to you", never "none"
        rosterHidden: true,
        canRemoveAccess: false,
        canRemoveMachines: false,
        pendingRemovals,
      });
      continue;
    }

    // The holder is not a grant and never appears in `access` (grants.mjs
    // refuses to write one for them). Without this row the owner of a mineral is
    // missing from the list of people who can reach it, which is the one row
    // nobody would think to question.
    rows.push({
      mineral,
      who: iHold
        ? { label: 'you', resolved: true, isMe: true }
        : { label: m.held_by && m.held_by !== 'someone else' ? m.held_by : 'someone else', resolved: m.held_by !== 'someone else', isMe: false },
      role: 'holder',
      status: 'active',
      isHolder: true,
      heldBy: m.held_by || '',
      devices: devicesFor(devices, iHold ? (me.hash || '') : '', true),
      rosterHidden: false,
      pendingRemovals,
      // TWO DIFFERENT PERMISSIONS, and collapsing them into one flag was a bug
      // waiting to happen: a holder's ACCESS cannot be revoked (handing a
      // mineral over is a transfer), but their MACHINES certainly can be, and
      // with the Devices page gone this is the only place to do it.
      canRemoveAccess: false,
      canRemoveMachines: iHold,
    });

    for (const g of m.access) {
      // THE HOLDER IS NOT ONE OF THEIR OWN GRANTEES. claimOwner writes the
      // holder into `access` at birth with role owner, so the roster really does
      // contain a row for them, and rendering it produced the owner twice: once
      // as "holds it" and once as "can manage it", on the same mineral, inches
      // apart. Found on the live fleet on Sam's own rock, not by any fixture.
      const isHolderRow = (m.holder_e && g.e && g.e === m.holder_e)
        || (m.holder_account_id && g.account_id && g.account_id === m.holder_account_id)
        // pre-2026-08-13 mirrors send no holder identity; when the mineral is
        // MINE the reader's own identity answers the same question
        || (iHold && !m.holder_e && !m.holder_account_id
          && ((me.hash && g.e === me.hash) || (me.id && g.account_id === me.id)));
      if (isHolderRow) continue;

      let who = nameGrantee(g, byHash, me);
      // A PENDING invitation to somebody with no account here yet resolves to
      // nothing, because there is no account to resolve against. The site knew
      // the address when it staged the invitation and kept it (kv.setInvite),
      // so use it rather than telling the owner their own invitation went to
      // "an account not on this site".
      if (!who.resolved && g.status === 'pending') {
        const hinted = invites.get(`${m.mineral_id}:${g.e || ''}`);
        if (hinted) who = { label: hinted, resolved: true, isMe: false, fromInvite: true };
      }
      rows.push({
        mineral,
        who,
        // `admin` is preserved rather than flattened (2026-08-14). This read
        // `g.role === 'owner' ? 'owner' : 'user'`, the LAST of five layers that
        // each dropped the admin role on the way past, so an admin grant could
        // never be rendered as one however it was created.
        role: g.role === 'owner' ? 'owner' : (g.role === 'admin' ? 'admin' : 'user'),
        status: g.status === 'pending' ? 'pending' : 'active',
        isHolder: false,
        heldBy: m.held_by || '',
        // Devices are attributed by the account that enrolled them (account_e
        // rides the mirror since 2026-08-12). A grantee with no machines yet is
        // a real and common state: they accepted, and have not opened it
        // anywhere.
        devices: devicesFor(devices, g.e || ''),
        rosterHidden: false,
        pendingRemovals,
        // The holder OR an admin may change a roster (2026-08-14), which is
        // exactly what /grant-request now lets past and what the mineral
        // re-checks on its own disk. The page offering a button the box would
        // refuse is the failure this mirrors the gate to avoid; it was
        // holder-only while an admin grant was a chip nothing could act on.
        //
        // MACHINES stay holder-only. Sam's ruling names one power and one only:
        // an admin can invite new people. Removing somebody's machine is a
        // different act on a different registry, and nobody has ruled on it.
        canRemoveAccess: iCanShare,
        canRemoveMachines: iHold,
        grantEmail: who.resolved && !who.isMe ? who.label : '',
      });
    }
  }
  // Group by mineral, then holder first, then people, then pending last. A
  // pending invitation at the bottom of its mineral reads as an outstanding
  // thing rather than as access.
  return rows.sort((a, b) => {
    const byMineral = a.mineral.name.localeCompare(b.mineral.name);
    if (byMineral) return byMineral;
    if (a.isHolder !== b.isHolder) return a.isHolder ? -1 : 1;
    if (a.status !== b.status) return a.status === 'pending' ? 1 : -1;
    return String(a.who.label).localeCompare(String(b.who.label));
  });
}

/**
 * Which machines belong to this row.
 *
 * Attribution comes from account_e, which has ridden the mirror since
 * 2026-08-12. Machines enrolled BEFORE that carry no attribution at all, and
 * every one of them is real and working. Dropping them would mean the page
 * quietly under-reports who can open a box, which is the precise failure this
 * whole surface exists to prevent, so they land on the holder row: unattributed
 * is not unknown, it is "enrolled before we recorded by whom", and the holder is
 * the honest owner of that.
 *
 * @param {object[]|null} devices  active roster rows, or null when not visible
 * @param {string} accountE        the grantee's email hash, or '' for the holder
 * @param {boolean} isHolderRow    the holder also collects the unattributed
 */
function devicesFor(devices, accountE, isHolderRow = false) {
  if (!Array.isArray(devices)) return [];
  if (isHolderRow) {
    return devices.filter((d) => !d.account_e || (accountE && String(d.account_e) === accountE));
  }
  if (!accountE) return [];
  return devices.filter((d) => String(d.account_e || '') === accountE);
}

/** Counts for the page's one-line summary. Derived, never stored. */
function summarise(rows) {
  const minerals = new Set(rows.map((r) => r.mineral.mineral_id || r.mineral.name));
  const people = new Set(rows.filter((r) => r.who.resolved).map((r) => r.who.label));
  const pending = rows.filter((r) => r.status === 'pending').length;
  const machines = rows.reduce((n, r) => n + (Array.isArray(r.devices) ? r.devices.length : 0), 0);
  const dark = new Set(rows.filter((r) => r.mineral.freshness.level === 'dark').map((r) => r.mineral.name));
  return { minerals: minerals.size, people: people.size, pending, machines, dark: dark.size };
}

module.exports = { buildRows, summarise, displayName, devicesFor };
