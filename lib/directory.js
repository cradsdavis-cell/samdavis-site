'use strict';
// lib/directory.js — the account's read path into the Crads directory (arc A).
//
// WHY A SERVER-SIDE PROXY. The worker already accepts the RS256 app token this
// site mints (it trusts https://crads-ai.com as a third issuer, T4), and every
// member route is per-caller gated. What it does NOT have is any CORS: there is
// no OPTIONS arm anywhere in worker.js, and the four `access-control-allow-
// origin: *` headers it does send are all on unauthenticated GETs. A browser
// adding an Authorization header triggers a preflight, the preflight 404s, and
// the call is dead before it starts.
//
// So the browser talks to this site (same origin, its own cookie) and the site
// talks to the worker. Two things fall out for free: the app token never enters
// browser JS where an XSS could take it, and there is exactly one place that
// knows the worker's address.
//
// This is NOT the mineral data path. Ruling 7 stands: when the manage layer
// arrives, the browser calls each mineral's own tunnel directly and the mineral
// verifies the token itself, so the platform never sits between a person and
// their brain. This file only reads the directory, which is platform
// infrastructure — the map, never the contents.
//
// Every method is fail-soft: { ok: true, ... } or { ok: false, reason }. A
// caller must be able to tell "you have nothing" from "I could not find out",
// because rendering the second as the first is how a UI lies (the house rule
// the fleet cards already follow).
const { createHash } = require('crypto');
const { mintAppToken } = require('./appAuth');

const DIRECTORY_URL = process.env.CRADS_DIRECTORY_URL || 'https://directory.crads-ai.com';
const TIMEOUT_MS = 8000;

const emailHash = (email) => createHash('sha256').update(String(email).toLowerCase()).digest('hex');

/**
 * A reader bound to one signed-in user.
 * @param {object} user   the kv user record (needs email + state_version)
 * @param {object} opts   { fetcher, baseUrl } for tests
 */
function directoryFor(user, { fetcher = fetch, baseUrl = DIRECTORY_URL } = {}) {
  const email = String(user && user.email || '').toLowerCase();
  const eh = emailHash(email);
  // One token per request-scoped reader: minting is cheap (in-process RS256)
  // and a token never outlives the page render.
  let token = null;
  const bearer = () => {
    if (!token) token = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled });
    return token;
  };
  // Per-reader cache: the minerals page reads edges and boxes once each, but a
  // future page composing several views must not re-ask per widget.
  const cache = new Map();

  async function get(path) {
    if (cache.has(path)) return cache.get(path);
    const out = await (async () => {
      let r;
      try {
        r = await fetcher(`${baseUrl}${path}`, {
          headers: { authorization: `Bearer ${bearer()}` },
          signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        });
      } catch (e) {
        return { ok: false, reason: `the directory could not be reached (${String(e && e.message || e).slice(0, 80)})` };
      }
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: 'the directory did not accept this account’s token' };
      }
      if (!r.ok) return { ok: false, reason: `the directory answered ${r.status}` };
      const body = await r.json().catch(() => null);
      if (!body) return { ok: false, reason: 'the directory sent something unreadable' };
      return { ok: true, body };
    })();
    cache.set(path, out);
    return out;
  }

  // Both custody acts on a roster of PEOPLE go through here: one route, one set
  // of gates, one place a scope mistake could be made and therefore one place to
  // check it. A MANAGE token per call, minted here rather than borrowed from the
  // page's reader, because the reader token is deliberately unscoped.
  async function stageGrant({ mineralId, email: subject, role, action }) {
    let r;
    try {
      const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled, scope: 'manage' });
      r = await fetcher(`${baseUrl}/grant-request`, {
        method: 'POST',
        headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mineral_id: String(mineralId), email: String(subject), role, action }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
      });
    } catch (e) {
      return { ok: false, reason: `the directory could not be reached (${String(e && e.message || e).slice(0, 80)})` };
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: body.error || `the directory answered ${r.status}` };
    return { ok: true, note: body.note || '' };
  }

  return {
    email,
    emailHash: eh,
    /**
     * This account's balance, as the cockpit last published it.
     *
     * ABSENT IS A NORMAL ANSWER. An account that has never been drawn from has
     * no row, and that is not an error to shout about: the page simply does not
     * show a balance card. Same for a directory that cannot be reached, because
     * a billing page that breaks when one widget cannot load is worse than one
     * that shows a little less.
     */
    async balance() {
      const r = await get('/my-balance');
      if (!r.ok) return { ok: false, reason: r.reason };
      if (r.body.none) return { ok: true, none: true };
      return {
        ok: true,
        balanceCents: Number(r.body.balance_cents) || 0,
        burnCents: Number(r.body.burn_cents) || 0,
        runwayDays: r.body.runway_days === null || r.body.runway_days === undefined ? null : Number(r.body.runway_days),
        at: Number(r.body.at) || 0,
      };
    },
    /** Ties this account holds: one row per (org, role). */
    async edges() {
      const r = await get(`/edges?e=${eh}`);
      if (!r.ok) return r;
      return { ok: true, edges: Array.isArray(r.body.edges) ? r.body.edges : [] };
    },
    /** Minerals that have registered themselves against this account. */
    async boxes() {
      const r = await get('/my-boxes');
      if (!r.ok) return r;
      return { ok: true, boxes: Array.isArray(r.body.boxes) ? r.body.boxes : [] };
    },
    /**
     * What this account can REACH (ownership/access model). The list the
     * account page shows: ownership is an attribute of a row, never the
     * filter, because filtering by ownership hides the assistant a person
     * uses daily whenever a company owns it.
     */
    async minerals() {
      const r = await get('/my-minerals');
      if (!r.ok) return r;
      return { ok: true, minerals: Array.isArray(r.body.minerals) ? r.body.minerals : [] };
    },
    /**
     * Ask a mineral to drop a machine's key (W1). Mints a MANAGE-scoped token
     * per call: custody acts never ride the page's plain reader token. The
     * worker checks the caller HOLDS the mineral; the mineral re-verifies on
     * its own disk before any key moves.
     */
    /**
     * Mirror this account's billing switch onto a rock it HOLDS (placeholder
     * spec, 2026-08-23). The worker reads licence:<org> to decide whether the
     * rock may take on another hosted box; the switch itself rides the token's
     * `billing` claim, so a manage token minted AFTER the flip is what carries
     * the truth. Called for every held rock when the switch flips, and by the
     * backfill.
     */
    async setLicence(mineralId) {
      let r;
      try {
        const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled, scope: 'manage' });
        r = await fetcher(`${baseUrl}/licence`, {
          method: 'POST',
          headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
          body: JSON.stringify({ mineral_id: String(mineralId) }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        });
      } catch (e) {
        return { ok: false, reason: `the directory could not be reached (${String(e && e.message || e).slice(0, 80)})` };
      }
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, reason: body.error || `the directory answered ${r.status}` };
      return { ok: true, org: body.org, status: body.status };
    },
    async revokeDevice(mineralId, slug) {
      let r;
      try {
        const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled, scope: 'manage' });
        r = await fetcher(`${baseUrl}/device-revoke-request`, {
          method: 'POST',
          headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
          body: JSON.stringify({ mineral_id: String(mineralId), slug: String(slug) }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        });
      } catch (e) {
        return { ok: false, reason: `the directory could not be reached (${String(e && e.message || e).slice(0, 80)})` };
      }
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, reason: body.error || `the directory answered ${r.status}` };
      return { ok: true, note: body.note || '' };
    },
    /**
     * What the mineral DID with the last custody act asked of it (findings 144
     * and 162, 2026-08-16).
     *
     * The outcomes have been written since the staged revoke and the staged
     * grant were built and NOTHING has ever read them, so a member who pressed
     * Remove and was refused saw an unchanged page and no explanation, twice.
     * `/custody-status` was then built to serve them and shipped with zero
     * consumers, which is why this method exists: the route without a caller is
     * the same silence in a different place.
     *
     * A MANAGE TOKEN PER CALL, minted here and never cached alongside the
     * page's plain reader token, exactly as revokeDevice and stageGrant do. The
     * worker demands manage scope on this read on the stated principle that a
     * read must never be easier than the write it reports on, so this is its
     * gate rather than this file's choice.
     *
     * NOT ON THE SHARED `get()` CACHE for the same reason: that path carries the
     * unscoped reader token, and a manage token must never end up in a cache a
     * plain page read can draw from.
     *
     * `status` rides on the failure so a caller can tell "not yours to see"
     * (403), "no such mineral" (404) and "it has never reported an address"
     * (409) from "the directory is down". Rendering the second as the first is
     * the lie this whole file's contract exists to prevent.
     */
    async custodyStatus(mineralId) {
      let r;
      try {
        const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled, scope: 'manage' });
        r = await fetcher(`${baseUrl}/custody-status?mineral_id=${encodeURIComponent(String(mineralId))}`, {
          headers: { authorization: `Bearer ${t}` },
          signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        });
      } catch (e) {
        return { ok: false, reason: `the directory could not be reached (${String(e && e.message || e).slice(0, 80)})` };
      }
      const body = await r.json().catch(() => null);
      if (!r.ok) return { ok: false, status: r.status, reason: (body && body.error) || `the directory answered ${r.status}` };
      if (!body) return { ok: false, status: r.status, reason: 'the directory sent something unreadable' };
      // Both halves are normalised to a present shape here, because the worker
      // omits `devices` entirely for an admin who is not the holder, and a
      // caller reaching into an absent half is how an optional field becomes a
      // crash on the one account that has an admin grant.
      const half = (h) => ({
        pending: Array.isArray(h && h.pending) ? h.pending : [],
        outcomes: Array.isArray(h && h.outcomes) ? h.outcomes : [],
      });
      return { ok: true, host: String(body.host || ''), devices: half(body.devices), access: half(body.access) };
    },
    /**
     * The operator's view of EVERYTHING (V3). Mints its OWN token with scope
     * 'admin' — the per-reader token above is deliberately unscoped, so a
     * normal page can never accidentally hold world-reading credentials.
     * The worker checks both the scope and that the caller IS the operator.
     */
    async adminAll() {
      let r;
      try {
        const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled, scope: 'admin' });
        r = await fetcher(`${baseUrl}/admin-minerals`, {
          headers: { authorization: `Bearer ${t}` },
          signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        });
      } catch (e) {
        return { ok: false, reason: `the directory could not be reached (${String(e && e.message || e).slice(0, 80)})` };
      }
      if (!r.ok) return { ok: false, reason: `the directory answered ${r.status}` };
      const body = await r.json().catch(() => null);
      if (!body) return { ok: false, reason: 'the directory sent something unreadable' };
      return { ok: true, minerals: body.minerals || [], boxes: body.boxes || [], orgs: body.orgs || [] };
    },
    /**
     * The topology slice for /app/admin's card-tree widget (ai-os spec
     * 2026-08-17-operator-topology-directory-lens): ties, reservations and
     * reflect heartbeats on top of what adminAll carries. Same admin-scoped
     * token, same operator double-check at the worker.
     */
    async adminTopology() {
      let r;
      try {
        const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled, scope: 'admin' });
        r = await fetcher(`${baseUrl}/admin/topology`, {
          headers: { authorization: `Bearer ${t}` },
          signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        });
      } catch (e) {
        return { ok: false, reason: `the directory could not be reached (${String(e && e.message || e).slice(0, 80)})` };
      }
      if (!r.ok) return { ok: false, reason: `the directory answered ${r.status}` };
      const body = await r.json().catch(() => null);
      if (!body) return { ok: false, reason: 'the directory sent something unreadable' };
      return { ok: true, minerals: body.minerals || [], edges: body.edges || [], orgs: body.orgs || [],
        orgedges: body.orgedges || [], reserved: body.reserved || [], reflect: body.reflect || {},
        generated: body.generated || 0 };
    },
    /**
     * This account's own slice of the membership event log (2026-08-13). The
     * log has held 800 days since the Mountain model landed; until /my-events
     * there was no way for anyone but the operator to read a line of it, which
     * is why the Activity page showed "Nothing recent" to accounts with months
     * of history.
     */
    async events(days = 30) {
      const r = await get(`/my-events?days=${encodeURIComponent(days)}`);
      if (!r.ok) return r;
      return { ok: true, events: Array.isArray(r.body.events) ? r.body.events : [] };
    },
    /**
     * Ask a mineral to admit an address. The mirror image of revokeDevice and
     * scoped the same way: a MANAGE token per call, never the page's reader
     * token, because widening who can reach a mineral is exactly as much of a
     * custody act as narrowing it.
     *
     * What lands on the box is a PENDING grant. The address still has to sign in
     * and prove it holds that mailbox before anything opens, so a typo costs
     * nothing.
     */
    async grantAccess(mineralId, inviteeEmail, role = 'member') {
      return stageGrant({ mineralId, email: inviteeEmail, role, action: 'grant' });
    },
    /**
     * Take an account's access away. The same route, same gates and same staged
     * key as grantAccess, with the sign flipped, so a grant withdrawn before the
     * box wakes collapses to the last thing asked for.
     *
     * On the box this CASCADES: every machine that account enrolled goes with
     * it. Removing access and leaving working keys behind would make this page
     * a liar in the one direction that matters.
     */
    async revokeGrant(mineralId, granteeEmail) {
      return stageGrant({ mineralId, email: granteeEmail, role: 'member', action: 'revoke' });
    },
    /** "A rock ended your tie, and here is why" cards. */
    async notices() {
      const r = await get('/rock-tie-notices');
      if (!r.ok) return r;
      return { ok: true, notices: Array.isArray(r.body.notices) ? r.body.notices : [] };
    },
  };
}

/**
 * Merge the two views into one row per mineral.
 *
 * A tie (from /edges) is the authority on the RELATIONSHIP: which rock, joined
 * or anchored, who owns it. A registration (from /my-boxes) is what a mineral
 * said about ITSELF: its host and how to reach it. They are joined on slug/host
 * because that is the only shared handle, and a mineral can legitimately appear
 * in one and not the other — a solo pebble has no tie, and a tie whose mineral
 * has not registered yet has no address.
 *
 * Deliberately NOT called "owned": /box-register never proves the owner hash it
 * is handed, so a registration is a claim by that mineral, not proof. The page
 * says "registered itself" for exactly that reason.
 */
function mergeMinerals({ edges = [], boxes = [] }) {
  const rows = new Map();
  const keyOf = (s) => String(s || '').replace(/-box$/, '').toLowerCase();

  for (const e of edges) {
    if (!e || (e.role && e.role !== 'member')) continue;   // operator rows are not minerals
    const key = keyOf(e.slug || e.box || e.org);
    rows.set(key, {
      key,
      name: e.slug || e.box || e.org,
      org: e.org,
      // org_display is omitted by the worker when empty — never defaulted there,
      // so the fallback belongs here rather than showing a blank
      orgDisplay: e.org_display || e.org,
      tie: e.rel || 'joined',
      status: e.status || 'active',
      ownedByOrg: e.owner === 'org',
      tier: e.tier || '',
      host: e.box || '',
      registered: false,
    });
  }
  for (const b of boxes) {
    if (!b || !b.host) continue;
    const key = keyOf(b.host);
    const row = rows.get(key) || { key, name: b.label || b.host, tie: '', status: 'active', registered: false };
    row.registered = true;
    row.host = row.host || b.host;
    row.ssh = b.ssh || {};
    if (!row.name) row.name = b.label || b.host;
    if (b.label && !rows.has(key)) row.name = b.label;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

module.exports = { directoryFor, mergeMinerals, emailHash, DIRECTORY_URL };
