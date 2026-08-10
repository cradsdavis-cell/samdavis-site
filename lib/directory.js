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
    if (!token) token = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id });
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

  return {
    email,
    emailHash: eh,
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
    async revokeDevice(mineralId, slug) {
      let r;
      try {
        const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, scope: 'manage' });
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
     * The operator's view of EVERYTHING (V3). Mints its OWN token with scope
     * 'admin' — the per-reader token above is deliberately unscoped, so a
     * normal page can never accidentally hold world-reading credentials.
     * The worker checks both the scope and that the caller IS the operator.
     */
    async adminAll() {
      let r;
      try {
        const t = mintAppToken({ email, stateVersion: user.state_version || 1, accountId: user.id, scope: 'admin' });
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
