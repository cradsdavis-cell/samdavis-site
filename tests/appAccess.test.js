'use strict';
// tests/appAccess.test.js — the access matrix (2026-08-13).
//
// The contract these pin, all of them Sam's rulings from the grill:
//   - one row per grant, account by mineral, devices collapsed into a count
//   - a member sees ONLY their own access; a holder sees the whole roster
//   - "not shown to you" and "none" are different facts and never conflate
//   - only the HOLDER can change a roster, so nobody else is offered a button
//   - unattributed machines land on the holder rather than vanishing
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { buildRows, summarise, devicesFor } = require('../lib/accessMatrix');
const { holderIndex, hashEmail, freshness, eventWords } = require('../lib/mineralView');

const ME = 'sam@x.com';
const HER = 'abbey@ic.example';
const ME_HASH = hashEmail(ME);
const HER_HASH = hashEmail(HER);

const USERS = [{ email: ME, id: 'acc_11111111' }, { email: HER, id: 'acc_22222222' }];
const BY_HASH = holderIndex(USERS);
const SELF = { hash: ME_HASH, id: 'acc_11111111', email: ME };

/** A mineral as /my-minerals renders it to its HOLDER: roster present. */
const heldByMe = (over = {}) => ({
  mineral_id: 'min_abc123', label: 'Keith', host: 'keith.crads-ai.com', tier: 'pebble',
  held_by: 'you', role: 'owner', updated: Date.now(),
  access: [{ e: HER_HASH, role: 'user', status: 'active' }],
  devices: [
    { slug: 'macbook', label: 'Sam’s MacBook', status: 'active', account_e: ME_HASH, last_seen: '2026-08-12T09:00:00Z' },
    { slug: 'abbeypc', label: 'Abbey PC', status: 'active', account_e: HER_HASH, last_seen: '' },
    { slug: 'oldbox', label: 'Oracle VPS', status: 'active', last_seen: '' },   // enrolled before account_e rode
  ],
  ...over,
});

/** The same mineral as a plain MEMBER sees it: the worker sends no roster. */
const sharedWithMe = (over = {}) => ({
  mineral_id: 'min_def456', label: 'Work Pebble', host: 'work-pebble.crads-ai.com',
  tier: 'pebble', held_by: 'Acme Ltd', role: 'user', updated: Date.now(),
  ...over,   // deliberately no `access`, no `devices`
});

test('a holder sees every grant on their mineral, plus themselves', () => {
  const rows = buildRows({ minerals: [heldByMe()], byHash: BY_HASH, me: SELF });
  assert.equal(rows.length, 2, 'the holder row and the one grant');
  assert.equal(rows[0].isHolder, true, 'the holder sorts first');
  assert.equal(rows[0].who.label, 'you');
  assert.equal(rows[1].who.label, HER, 'the hash resolved to a real address');
  assert.equal(rows[1].role, 'user');
});

test('the holder appears even though grants.mjs never writes a grant for them', () => {
  // The one row nobody would think to question if it were missing: the owner of
  // a mineral absent from the list of people who can reach it.
  const rows = buildRows({ minerals: [heldByMe({ access: [] })], byHash: BY_HASH, me: SELF });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].isHolder, true);
});

test('a member gets exactly one row, their own, and is told the roster is hidden', () => {
  const rows = buildRows({ minerals: [sharedWithMe()], byHash: BY_HASH, me: SELF });
  assert.equal(rows.length, 1, 'one row: theirs');
  assert.equal(rows[0].who.isMe, true);
  assert.equal(rows[0].rosterHidden, true, 'hidden, which is not the same as empty');
  assert.equal(rows[0].devices, null, 'null means not shown to you, never none');
  assert.equal(rows[0].canRevoke, false);
});

test('an unresolvable hash is named as unresolved, never dressed up as a person', () => {
  const stranger = heldByMe({ access: [{ e: hashEmail('nobody@elsewhere.example'), role: 'user', status: 'active' }] });
  const rows = buildRows({ minerals: [stranger], byHash: BY_HASH, me: SELF });
  const g = rows.find((r) => !r.isHolder);
  assert.equal(g.who.resolved, false);
  assert.match(g.who.label, /not on this site/);
  assert.equal(g.grantEmail, '', 'no address means no revoke target, so no button');
});

test('machines are attributed by the account that enrolled them', () => {
  const rows = buildRows({ minerals: [heldByMe()], byHash: BY_HASH, me: SELF });
  const holder = rows.find((r) => r.isHolder);
  const grantee = rows.find((r) => !r.isHolder);
  assert.deepEqual(grantee.devices.map((d) => d.slug), ['abbeypc']);
  // the unattributed row is REAL and working, so it lands on the holder rather
  // than being dropped: under-reporting who can open a box is the one failure
  // this page exists to prevent
  assert.deepEqual(holder.devices.map((d) => d.slug).sort(), ['macbook', 'oldbox']);
});

test('revoked machines never count towards anything', () => {
  const m = heldByMe();
  m.devices.push({ slug: 'gone', label: 'Old laptop', status: 'revoked', account_e: HER_HASH });
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF });
  const grantee = rows.find((r) => !r.isHolder);
  assert.ok(!grantee.devices.some((d) => d.slug === 'gone'));
});

test('only the holder is offered a way to change the roster', () => {
  // an owner-ROLE grant on somebody else's mineral: sees everything, changes
  // nothing, which is what /grant-request enforces server-side
  const notMine = heldByMe({ held_by: 'Acme Ltd', role: 'owner' });
  const rows = buildRows({ minerals: [notMine], byHash: BY_HASH, me: SELF });
  assert.ok(rows.every((r) => r.canRevoke === false), 'no buttons that would 403');
});

test('the holder cannot be revoked: handing a mineral over is a transfer', () => {
  const rows = buildRows({ minerals: [heldByMe()], byHash: BY_HASH, me: SELF });
  assert.equal(rows.find((r) => r.isHolder).canRevoke, false);
});

test('a pending invitation sorts last and is not counted as access', () => {
  const m = heldByMe({
    access: [
      { e: HER_HASH, role: 'user', status: 'pending' },
      { e: hashEmail('other@x.com'), role: 'user', status: 'active' },
    ],
  });
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF });
  assert.equal(rows[rows.length - 1].status, 'pending', 'outstanding things sit at the bottom');
  assert.equal(summarise(rows).pending, 1);
});

test('devicesFor: a grantee with no hash gets nothing rather than everything', () => {
  // The failure mode worth pinning: a falsy filter that returns the whole list
  // would show one member every other member's machines.
  const devices = [{ slug: 'a', account_e: HER_HASH }, { slug: 'b' }];
  assert.deepEqual(devicesFor(devices, '', false), []);
  assert.deepEqual(devicesFor(null, HER_HASH, false), []);
});

// ---- freshness ------------------------------------------------------------
test('freshness reads silence as silence, not as calm', () => {
  const now = Date.parse('2026-08-13T12:00:00Z');
  assert.equal(freshness(now - 5 * 60 * 1000, now).level, 'fresh', 'minutes old says nothing');
  assert.equal(freshness(now - 3 * 3600 * 1000, now).level, 'recent');
  assert.equal(freshness(now - 2 * 24 * 3600 * 1000, now).level, 'stale');
  assert.equal(freshness(now - 9 * 24 * 3600 * 1000, now).level, 'dark');
  assert.equal(freshness(0, now).level, 'unknown', 'never reported is its own state');
  assert.match(freshness(now - 9 * 24 * 3600 * 1000, now).words, /dark for 9 days/);
});

test('a fresh mineral wears no chip: furniture is not information', () => {
  const now = Date.parse('2026-08-13T12:00:00Z');
  const { freshnessChip } = require('../lib/mineralView');
  assert.equal(freshnessChip(now - 60 * 1000, now), '');
  assert.match(freshnessChip(now - 9 * 24 * 3600 * 1000, now), /chip bad/);
});

// ---- event vocabulary -----------------------------------------------------
test('the log speaks wire words and the page speaks English', () => {
  assert.match(eventWords({ type: 'member-join', org: 'ic', rel: 'anchored', status: 'active' }), /Anchored to ic/);
  assert.match(eventWords({ type: 'member-join', org: 'ic', rel: 'joined', status: 'pending' }), /Asked to join ic/);
  assert.match(eventWords({ type: 'member-left', org: 'ic' }), /Left ic/);
  assert.match(eventWords({ type: 'grant-proof', org: 'ic' }), /Accepted an invitation/);
});

test('an event nobody wrote words for still renders: hiding it would be a lie by omission', () => {
  assert.equal(eventWords({ type: 'some-new-thing' }), 'some new thing');
});

// ---- defects found by rendering the page, not by running the tests ---------

test('a pending invitation names who was invited, not "an account not on this site"', () => {
  // The directory holds only sha256(address), by design, so a pending grant to
  // somebody with no account here yet resolves to nothing. Truthful and useless:
  // the owner was shown a stranger where their own invitation should be. The
  // site knew the address when it staged the invite and keeps it.
  const invitee = 'new@client.example';
  const m = heldByMe({ access: [{ e: hashEmail(invitee), role: 'user', status: 'pending' }] });
  const invites = new Map([[`${m.mineral_id}:${hashEmail(invitee)}`, invitee]]);
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF, invites });
  const pending = rows.find((r) => r.status === 'pending');
  assert.equal(pending.who.label, invitee);
  assert.equal(pending.who.resolved, true);
  assert.equal(pending.grantEmail, invitee, 'and it can therefore be withdrawn');
});

test('the invite hint only ever fills a gap: a real account always wins', () => {
  const m = heldByMe();   // Abbey has a real account and an ACTIVE grant
  const invites = new Map([[`${m.mineral_id}:${HER_HASH}`, 'stale@old.example']]);
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF, invites });
  assert.equal(rows.find((r) => !r.isHolder).who.label, HER, 'the account list is the authority');
});

test('an unresolvable pending row with no hint still says so honestly', () => {
  const m = heldByMe({ access: [{ e: hashEmail('ghost@x.com'), role: 'user', status: 'pending' }] });
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF, invites: new Map() });
  assert.equal(rows.find((r) => r.status === 'pending').who.resolved, false, 'a missing hint is not a licence to guess');
});

// ---- defects found by walking the LIVE fleet's records --------------------

test('the holder is not also listed as one of their own grantees', () => {
  // claimOwner writes the holder into `access` at birth with role owner, so the
  // roster genuinely contains a row for them. Rendering it produced Sam's own
  // rock listing him twice, inches apart: "you · holds it" and "you · can manage
  // it". Found on real KV records, invisible to every fixture written by hand.
  const m = heldByMe({
    holder_e: ME_HASH,
    access: [{ e: ME_HASH, role: 'owner', status: 'active' }, { e: HER_HASH, role: 'user', status: 'active' }],
  });
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF });
  assert.equal(rows.filter((r) => r.who.isMe).length, 1, 'exactly one row is you');
  assert.equal(rows.length, 2, 'the holder row and the one real grant');
  assert.equal(rows[0].isHolder, true);
  assert.equal(rows[1].who.label, HER);
});

test('a pre-2026-08-13 mirror sends no holder identity, and the reader still dedupes their own row', () => {
  // Every mineral on the fleet is on an older image today. Falling back to the
  // reader's own identity is what stops the fix waiting on an image rollout.
  const m = heldByMe({ access: [{ e: ME_HASH, role: 'owner', status: 'active' }] });
  delete m.holder_e;
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF });
  assert.equal(rows.length, 1, 'just the holder');
  assert.equal(rows[0].isHolder, true);
});

test('the fallback does NOT fire on a mineral somebody else holds', () => {
  // The narrow case the fallback must not swallow: an owner-role grant of mine
  // on another person's mineral is a real row and must survive.
  const m = heldByMe({ held_by: 'Acme Ltd', role: 'owner', access: [{ e: ME_HASH, role: 'owner', status: 'active' }] });
  delete m.holder_e;
  const rows = buildRows({ minerals: [m], byHash: BY_HASH, me: SELF });
  assert.equal(rows.length, 2, 'the holder row plus my own real grant');
  assert.ok(rows.some((r) => !r.isHolder && r.who.isMe), 'my grant is still listed');
});
