'use strict';
// /app/devices — machines first (2026-08-10 app audit ruling), joined on
// IDENTITY rather than on names (2026-08-12).
//
// What went wrong, and why these assertions are shaped the way they are. The
// page used to decide two rows were one machine by comparing their names,
// reduced to a slug. Sam opened it on his own rock and saw "This computer" and
// "Win32" with no way to tell two machines from one machine added twice. The
// join could never have worked: nothing typed those names from the machine, and
// the sessions it matched against are labelled with browser families
// ("Chrome on Windows"), which no roster slug equals.
//
// The old version of this file hid that, because it seeded a session labelled
// "Sam's MacBook" — a label lib/sessions.js cannot produce — so the fold it
// pinned had never once happened in production. Everything below uses shapes
// the running system actually emits.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// require the assembler without booting Redis: read via the exported symbol
// on a stubbed-kv module load, the appAdmin.test.js pattern
const kvMod = require('../lib/kv');
const realDefault = kvMod.defaultKv;
kvMod.defaultKv = () => ({});
const { assembleMachines, assembleDoor } = require('../api/app/devices.js');
kvMod.defaultKv = realDefault;

const MID_A = 'a'.repeat(32);
const MID_B = 'b'.repeat(32);
const ME = 'e'.repeat(64);

test('one row per MACHINE, across minerals, joined on machine_id and not on the label', () => {
  const { machines, orphanSessions } = assembleMachines({
    me: ME,
    minerals: [
      { mineral_id: 'min_a', label: 'Keith', host: 'keith', devices: [
        { slug: 'sams-laptop', label: 'sams-laptop', machine_id: MID_A, added: '2026-08-01', status: 'active', vault: true, last_seen: '2026-08-12T09:00:00Z', account_e: ME },
        { slug: 'old-imac', label: 'Old iMac', machine_id: MID_B, added: '2026-07-01', status: 'revoked' },
      ] },
      { mineral_id: 'min_b', label: 'Test Org 4', host: 'test-org-4', devices: [
        // the SAME machine, and deliberately under a different label: the join
        // must not care what either roster calls it
        { slug: 'sams-macbook', label: 'Sam’s MacBook', machine_id: MID_A, added: '2026-08-05', status: 'active', vault: false, last_seen: '2026-08-10T09:00:00Z' },
      ] },
    ],
    sessions: [{ sid: 's2', label: 'Chrome on Windows', last_seen: '2026-08-09T10:00:00Z' }],
  });

  assert.equal(machines.length, 1, 'the same machine on two rosters is ONE row, whatever each calls it');
  const m = machines[0];
  assert.equal(m.opens.length, 2, 'and it opens both minerals');
  assert.equal(m.added, '2026-08-01', 'the earliest enrolment dates the machine');
  assert.equal(m.last_seen, '2026-08-12T09:00:00Z', 'the most recent sighting across every mineral it opens');
  assert.equal(m.mine, true, 'the account that enrolled it is recognised by hash, never by a stored address');
  assert.deepEqual(m.opens.map((o) => o.vault), [true, false], 'capacity is per mineral, not per machine');
  assert.ok(!machines.some((x) => x.label === 'Old iMac'), 'a revoked device is not a machine that can open anything');

  assert.equal(orphanSessions.length, 1, 'a browser cannot prove which machine it is on, so it never folds');
  assert.equal(orphanSessions[0].sid, 's2');
});

test('a device from a mineral that sends no machine_id stays its own row, never a guessed merge', () => {
  // Older box images mirror names only. A wrong merge would claim two people's
  // laptops are one machine, which is worse than showing two rows.
  const { machines } = assembleMachines({
    minerals: [
      { mineral_id: 'min_a', label: 'Keith', devices: [{ slug: 'this-computer', label: 'This computer', status: 'active' }] },
      { mineral_id: 'min_b', label: 'Other', devices: [{ slug: 'this-computer', label: 'This computer', status: 'active' }] },
    ],
    sessions: [],
  });
  assert.equal(machines.length, 2, 'identical names on two minerals prove nothing');
});

test('a session only folds onto a machine when it can prove which one it is', () => {
  const rows = assembleMachines({
    minerals: [{ mineral_id: 'min_a', label: 'Keith', devices: [
      { slug: 'laptop', label: 'laptop', machine_id: MID_A, status: 'active' },
    ] }],
    sessions: [
      { sid: 'app', label: 'Crads-AI app', machine_id: MID_A, last_seen: '2026-08-12T09:00:00Z' },
      { sid: 'web', label: 'Chrome on Windows', last_seen: '2026-08-12T09:00:00Z' },
    ],
  });
  assert.equal(rows.machines[0].session.sid, 'app', 'a session carrying the machine id belongs to that machine');
  assert.deepEqual(rows.orphanSessions.map((s) => s.sid), ['web'], 'and a browser stays in its own list');
});

test('a staged removal is carried onto the machine that is being removed', () => {
  const { machines } = assembleMachines({
    minerals: [{ mineral_id: 'min_a', label: 'Keith', pending_removals: ['laptop'], devices: [
      { slug: 'laptop', label: 'laptop', machine_id: MID_A, status: 'active' },
      { slug: 'desktop', label: 'desktop', machine_id: MID_B, status: 'active' },
    ] }],
    sessions: [],
  });
  const byLabel = Object.fromEntries(machines.map((m) => [m.label, m]));
  assert.equal(byLabel.laptop.opens[0].removing, true);
  assert.equal(byLabel.desktop.opens[0].removing, false, 'only the one that was asked for');
});

test('the door: birth keys and support, per mineral, support present even when off', () => {
  const door = assembleDoor([
    { label: 'Keith', door: { founders: [{ name: 'Sam Davis', machine_ids: [MID_A] }], support: { active: false, expires_at: '' } } },
    { label: 'QA Rock B', door: { founders: [], support: { active: true, expires_at: '2026-08-12T18:00:00Z' } } },
  ]);
  assert.deepEqual(door.founders.map((f) => [f.mineral, f.who]), [['Keith', 'Sam Davis']]);
  assert.equal(door.support.length, 2, 'an off grant is still a row: absence would be a question, not an answer');
  assert.equal(door.support[0].active, false);
  assert.equal(door.support[1].expires_at, '2026-08-12T18:00:00Z');
});

test('a mineral with no door at all does not break the page', () => {
  // A user-role grant is not sent the door, and an older image does not send one.
  const door = assembleDoor([{ label: 'Keith' }, { label: 'Other', devices: [] }]);
  assert.deepEqual(door, { founders: [], support: [] });
});

test('the page copy: machines persist, removal is the mineral\'s act, every key is shown', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'app', 'devices.js'), 'utf8');
  assert.match(src, /stays here until you remove it/, 'persistence is the promise');
  assert.match(src, /applies this itself/, 'the mineral is the decider, said on the confirm');
  assert.match(src, /Enrolled machines keep their keys/, 'sign-out-everywhere states what it does NOT do');
  assert.match(src, /rosters just now/, 'an unreadable roster read is named, never rendered as no machines');
  assert.match(src, /removal in progress/i, 'a staged removal is visible while the mineral decides');
  assert.match(src, /Nobody at Crads can get in unless you grant it/, 'support off is stated plainly, for the person being sold to');
});

test('the session copy tells the truth about when a session expires', () => {
  // It said "expire on their own after 60 days". lib/account.js re-issues the
  // cookie past the halfway mark — its own comment says active users stay signed
  // in indefinitely — so 60 days is the IDLE life, not the lifetime.
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'app', 'devices.js'), 'utf8');
  assert.match(src, /60 days after they are last used/);
  assert.doesNotMatch(src, /expire on their own after 60 days/);
});

test('the remove form posts mineral + slug to the staging handler', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'app', 'devices.js'), 'utf8');
  assert.match(src, /action="\/api\/app\/device-remove"/);
  assert.match(src, /name="mineral_id"/);
  assert.match(src, /name="slug"/);
  const remover = fs.readFileSync(path.join(__dirname, '..', 'api', 'app', 'device-remove.js'), 'utf8');
  assert.match(remover, /revokeDevice/, 'staged through the manage-scoped reader method');
  assert.match(remover, /303/, 'and lands back on the page');
});
