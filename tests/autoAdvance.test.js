'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { stageForSessionsUsed, nextBlockStage } = require('../lib/autoAdvance');

test('stageForSessionsUsed maps consumed sessions to the right stage', () => {
  assert.strictEqual(stageForSessionsUsed(1), 'pre-s1');         // S1 booked, none done
  assert.strictEqual(stageForSessionsUsed(2), 'between-s1-s2');  // S1 done
  assert.strictEqual(stageForSessionsUsed(3), 'between-s2-s3');
  assert.strictEqual(stageForSessionsUsed(4), 'between-s3-s4');
  assert.strictEqual(stageForSessionsUsed(5), 'between-s3-s4');  // capped, never post-s4
  assert.strictEqual(stageForSessionsUsed(0), 'pre-s1');
});

test('advances forward when the count implies a later stage', () => {
  assert.strictEqual(nextBlockStage('pre-s1', 2), 'between-s1-s2');
  assert.strictEqual(nextBlockStage('between-s1-s2', 3), 'between-s2-s3');
  assert.strictEqual(nextBlockStage('between-s2-s3', 4), 'between-s3-s4');
});

test('never advances backward or restates the same stage', () => {
  assert.strictEqual(nextBlockStage('between-s2-s3', 2), null); // count says earlier → hold
  assert.strictEqual(nextBlockStage('between-s1-s2', 2), null); // same stage → no-op
  assert.strictEqual(nextBlockStage('between-s3-s4', 4), null);
});

test('never auto-advances to post-s4-decision from the counter', () => {
  // even with all 4 booked, finishing the block needs S4 actually delivered
  assert.strictEqual(nextBlockStage('between-s3-s4', 9), null);
});

test('leaves non-block states untouched', () => {
  assert.strictEqual(nextBlockStage('onboarding-incomplete', 3), null);
  assert.strictEqual(nextBlockStage('retainer-active', 3), null);
  assert.strictEqual(nextBlockStage('graduated', 3), null);
  assert.strictEqual(nextBlockStage('post-s4-decision', 3), null);
});
