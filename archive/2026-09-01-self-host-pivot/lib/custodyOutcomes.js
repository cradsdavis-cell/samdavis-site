'use strict';
// lib/custodyOutcomes.js: what the mineral DID with the last thing you asked it
// (findings 144, 162 and 163, 2026-08-16).
//
// WHAT WENT WRONG. `/revoke-consume` and `/grant-consume` have written
// `revokedone:<host>:<slug>` and `grantdone:<host>:<eh>` since the day they were
// built, carrying the mineral's own outcome and its own words for it. Nothing
// read them: one writer, zero readers, across directory/, wizard/, engine/ and
// this site. On 2026-08-16 a member pressed Remove on their only machine, the
// mineral refused with a genuinely good reason ("this is the last key that can
// open this mineral, so removing it would lock everyone out; add another
// computer first, then remove this one"), and ten minutes later /app/access
// still read "1 machine" with no explanation and Recent changes had no row. The
// answer existed the whole time, one prefix away. Then `/custody-status` was
// built to serve it and shipped with zero consumers, so the member still saw
// nothing (finding 162): a green test over an unreachable fix.
//
// THE RULE THAT NOW HOLDS. The mineral is the authority on what it did, so the
// mineral's own words are what a person reads. This file never invents a reason
// and never softens one; it only says which act the words are about and leaves
// `reason` exactly as the box wrote it.
//
// BOTH HALVES, because it is one defect in two key shapes. Device removals and
// access grants/revocations are the same act on two rosters, they are staged
// through the same shape of route, and they were both silent. Fixing only the
// machine half would leave "you invited someone and the mineral refused" just as
// invisible as it was this morning.
//
// WHAT THIS FILE MAY NOT DO. It knows nothing about accounts, the same line
// lib/mineralView.js draws: the caller resolves a slug to a machine label and an
// address hash to an address, and passes the words in. It renders no HTML.

// The two honest limits of the store behind this, both of them the reader's
// problem to state rather than to hide.
//
//   24 HOURS: `/revoke-consume` and `/grant-consume` write with
//   `expirationTtl: 24 * 3600`. This answers "what happened to what I just
//   asked for", never "what has ever happened here".
//
//   LAST ATTEMPT ONLY (finding 163): the done record is keyed per slug and per
//   address hash and written with KV.put, so a second attempt OVERWRITES the
//   first. Observed on 2026-08-16: a refusal was replaced by
//   {"outcome":"applied"} on the retry, and the refusal is not recoverable from
//   anywhere. A surface built on this must therefore never present itself as a
//   history, and must say so where a person can see it, because a feed that
//   silently keeps one of two answers is a feed that lies by omission.
const OUTCOME_NOTE = 'A mineral’s answer to a removal or an invitation is kept for 24 hours, and only the most recent attempt per machine or per address is kept, so asking a second time replaces the first answer.';

/**
 * Can this account ask `/custody-status` about this mineral?
 *
 * MIRRORS THE WORKER'S GATE ON PURPOSE (worker.js `/custody-status`): holder, or
 * an admin whose grant is not still pending. Deriving it here keeps a page from
 * asking a question the directory is certain to refuse, which is the same reason
 * api/app/access.js derives `canInviteTo` rather than rendering a form the box
 * would reject. It is a politeness, never a permission: the worker re-checks.
 *
 * `status !== 'pending'` rather than `=== 'active'` is the access record's own
 * convention, and the worker uses that exact test.
 *
 * @param {object} mineral  a /my-minerals row
 * @param {object} me       { hash, id }
 */
function canReadCustody(mineral, me = {}) {
  const m = mineral || {};
  if (!m.mineral_id || !m.host) return false;   // the worker 409s without a host
  if (m.held_by === 'you') return true;
  return Array.isArray(m.access) && m.access.some((g) => g
    && g.role === 'admin' && g.status !== 'pending'
    && ((me.hash && g.e === me.hash) || (me.id && g.account_id === me.id)));
}

/** The reason as the box wrote it, or '' when it sent none. Never invented. */
function boxWords(rec) {
  const r = String((rec && rec.reason) || '').trim();
  return r && !/^no reason$/i.test(r) ? r : '';
}

/**
 * The last thing the mineral said about ONE machine, or null.
 *
 * Used by the Remove button's handler so a second press cannot be as silent as
 * the first. Only ever the LAST attempt, per the finding-163 note above.
 *
 * @param {object} status  a directoryFor().custodyStatus() result
 * @param {string} slug
 */
function lastDeviceOutcome(status, slug) {
  const rows = (status && status.devices && status.devices.outcomes) || [];
  const hit = rows.find((r) => r && String(r.slug) === String(slug));
  if (!hit) return null;
  return {
    slug: String(hit.slug || ''),
    outcome: hit.outcome === 'applied' ? 'applied' : 'refused',
    reason: boxWords(hit),
    at: Number(hit.at) || 0,
  };
}

/**
 * Turn one mineral's custody status into dated rows for a feed.
 *
 * PENDING RIDES ALONGSIDE OUTCOMES because "asked, and nothing has come back"
 * and "asked, and nothing happened" are different facts and the page must never
 * render the first as the second. That is the whole shape of finding 144: a
 * button that does nothing looks identical to a button whose answer was thrown
 * away.
 *
 * @param {object}   o
 * @param {object}   o.status         directoryFor().custodyStatus() result
 * @param {string}   o.mineralName    display name, already resolved by the caller
 * @param {Map}      o.deviceLabels   slug -> machine label (caller resolves)
 * @param {Map}      o.accountNames   address hash -> address (caller resolves)
 * @returns {object[]} rows: { at, kind, outcome, title, reason }
 */
function custodyRows({ status, mineralName = 'a mineral', deviceLabels = new Map(), accountNames = new Map() } = {}) {
  if (!status || !status.ok) return [];
  const rows = [];
  const machine = (slug) => deviceLabels.get(String(slug)) || String(slug) || 'a machine';
  // An address the site cannot resolve is NAMED as unresolved rather than
  // printed as a hash: same ruling as mineralView.nameGrantee (finding 56).
  const person = (rec) => String(rec.email || '').trim()
    || accountNames.get(String(rec.e || ''))
    || 'an account not on this site';

  for (const p of (status.devices && status.devices.pending) || []) {
    rows.push({
      at: Number(p.at) || 0, kind: 'device', outcome: 'pending',
      title: `Waiting for ${mineralName} to remove ${machine(p.slug)}`, reason: '',
    });
  }
  for (const d of (status.devices && status.devices.outcomes) || []) {
    const applied = d.outcome === 'applied';
    rows.push({
      at: Number(d.at) || 0, kind: 'device', outcome: applied ? 'applied' : 'refused',
      title: applied
        ? `${machine(d.slug)} was removed from ${mineralName}`
        : `${mineralName} refused to remove ${machine(d.slug)}`,
      reason: boxWords(d),
    });
  }

  // `action` is 'grant' or 'revoke'. The worker defaults a missing one to
  // 'grant' on the pending half and leaves it '' on the outcome half, so read it
  // the same way in both places and treat anything that is not 'revoke' as a
  // grant, which is what the box does.
  const giving = (rec) => String(rec.action || '') !== 'revoke';
  for (const p of (status.access && status.access.pending) || []) {
    rows.push({
      at: Number(p.at) || 0, kind: 'access', outcome: 'pending',
      title: giving(p)
        ? `Waiting for ${mineralName} to give ${person(p)} access`
        : `Waiting for ${mineralName} to take ${person(p)}’s access away`,
      reason: '',
    });
  }
  for (const a of (status.access && status.access.outcomes) || []) {
    const applied = a.outcome === 'applied';
    const give = giving(a);
    let title;
    if (applied) title = give ? `${person(a)} was given access to ${mineralName}` : `${person(a)}’s access to ${mineralName} was taken away`;
    else title = give ? `${mineralName} refused to give ${person(a)} access` : `${mineralName} refused to take ${person(a)}’s access away`;
    rows.push({ at: Number(a.at) || 0, kind: 'access', outcome: applied ? 'applied' : 'refused', title, reason: boxWords(a) });
  }
  return rows;
}

module.exports = { canReadCustody, custodyRows, lastDeviceOutcome, boxWords, OUTCOME_NOTE };
