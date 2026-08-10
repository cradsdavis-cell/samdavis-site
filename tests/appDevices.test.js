'use strict';
// /app/devices — machines first (2026-08-10 app audit ruling). The persistent
// spine is the mineral rosters; sessions fold on where the labels line up.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// require the assembler without booting Redis: read via the exported symbol
// on a stubbed-kv module load, the appAdmin.test.js pattern
const kvMod = require('../lib/kv');
const realDefault = kvMod.defaultKv;
kvMod.defaultKv = () => ({});
const { assembleMachines } = require('../api/app/devices.js');
kvMod.defaultKv = realDefault;

test('one row per MACHINE, across minerals, with the session folded on', () => {
  const { machines, orphanSessions } = assembleMachines({
    minerals: [
      { mineral_id: 'min_a', label: 'Keith', host: 'keith', devices: [
        { slug: 'sams-macbook', label: 'Sam’s MacBook', added: '2026-08-01', status: 'active' },
        { slug: 'old-imac', label: 'Old iMac', added: '2026-07-01', status: 'revoked' },
      ] },
      { mineral_id: 'min_b', label: 'Test Org 4', host: 'test-org-4', devices: [
        { slug: 'sams-macbook', label: 'Sam’s MacBook', added: '2026-08-05', status: 'active' },
      ] },
    ],
    sessions: [
      { sid: 's1', label: 'Sam’s MacBook', last_seen: '2026-08-10T10:00:00Z' },
      { sid: 's2', label: 'Chrome on Windows', last_seen: '2026-08-09T10:00:00Z' },
    ],
  });
  assert.equal(machines.length, 1, 'the same machine on two rosters is ONE row');
  const m = machines[0];
  assert.equal(m.opens.length, 2, 'and it opens both minerals');
  assert.equal(m.added, '2026-08-01', 'the earliest enrolment dates the machine');
  assert.equal(m.session.sid, 's1', 'its session folded on, by label');
  assert.equal(orphanSessions.length, 1, 'a session matching no machine stays separate');
  assert.equal(orphanSessions[0].sid, 's2');
  assert.ok(!machines.some((x) => x.label === 'Old iMac'), 'a revoked device is not a machine that can open anything');
});

test('the page copy: machines persist, removal is the mineral\'s act, sessions are named as ephemeral', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'app', 'devices.js'), 'utf8');
  assert.match(src, /stays here until you remove it/, 'persistence is the promise');
  assert.match(src, /applies this itself/, 'the mineral is the decider, said on the confirm');
  assert.match(src, /expire on their own after 60 days/, 'sessions are called what they are');
  assert.match(src, /Enrolled machines keep their keys/, 'sign-out-everywhere states what it does NOT do');
  assert.match(src, /rosters just now/, 'an unreadable roster read is named, never rendered as no machines');
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
