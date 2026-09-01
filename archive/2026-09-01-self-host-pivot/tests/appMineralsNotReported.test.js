'use strict';
// A mineral with no mirror record must not be offered as openable (finding 76,
// 2026-08-12).
//
// `assemble` lets a TIE stand alone, because a mineral may not have registered
// YET. Nothing separated that from "no longer exists", so a destroyed pebble kept
// a full card with a working-looking crads-ai:// link. Observed live:
// local-pebble-test-2 rendered here with a tier badge and an open link while it
// reconciled 6/6 FAIL across metal, edge and directory, and /app/admin, which
// reads mirror records only, correctly showed it gone. Two surfaces of one
// product, same signed-in account, different answers.
//
// The same rendering covers the invited case (finding 83): a rock-stamped pebble
// sits at `invited` until its member claims it, and its owner should see it
// pending rather than not at all.

const test = require('node:test');
const assert = require('node:assert');
const { renderRow, assemble } = require('../api/app/minerals');

const OPEN_LINK = /crads-ai:\/\/box\//;

test('an authoritative mineral is still openable', () => {
  const html = renderRow({
    key: 'qa-base-gllm', host: 'qa-base-gllm.crads-ai.com', label: 'qa-base-gllm',
    tier: 'rock', held_by: 'you', authoritative: true,
  });
  assert.match(html, OPEN_LINK, 'a real mineral must keep its one action');
  assert.ok(!/not reported in/.test(html));
});

test('THE REGRESSION: a tie with no mirror record offers no open link', () => {
  // Exactly the shape local-pebble-test-2 had: a tie, a tier, and nothing behind it.
  const html = renderRow({
    key: 'local-pebble-test-2', host: 'local-pebble-test-2.crads-ai.com',
    tier: 'pebble', tie: 'anchored', org: 'crads-solo', orgDisplay: 'Crads standalone minerals',
  });
  assert.ok(!OPEN_LINK.test(html), 'a mineral that exists in no store must not offer to open');
  assert.match(html, /Not ready to open yet/);
  assert.match(html, /not reported in/, 'and the card must say so, not stay silent');
});

test('the unopenable card still names the mineral rather than hiding it', () => {
  // Hiding it would be the other dishonest answer: an invited pebble the owner
  // was just emailed about should appear, pending.
  const html = renderRow({ key: 'qa-pebble-one', host: 'qa-pebble-one.crads-ai.com', tier: 'pebble', tie: 'anchored' });
  assert.match(html, /qa-pebble-one/);
});

test('assemble marks mirror rows authoritative and leaves tie-only rows unmarked', () => {
  // The flag this fix depends on has to actually be set by the assembler, or the
  // whole thing silently degrades to "nothing is openable".
  const rows = assemble({
    minerals: [{ host: 'real.crads-ai.com', label: 'Real', tier: 'rock' }],
    edges: [{ slug: 'ghost', box: 'ghost.crads-ai.com', role: 'member', rel: 'anchored', org: 'crads-solo' }],
  });
  const real = rows.find((r) => r.key === 'real');
  const ghost = rows.find((r) => r.key === 'ghost');
  assert.ok(real && real.authoritative === true, 'mirror rows are authoritative');
  assert.ok(ghost && !ghost.authoritative, 'tie-only rows are not');
  assert.match(renderRow(real), OPEN_LINK);
  assert.ok(!OPEN_LINK.test(renderRow(ghost)));
});
