// lib/autoAdvance.js — make the block journey stage self-driving.
//
// The journey `state` (pre-s1 → between-s1-s2 → … → between-s3-s4) used to advance only
// when Sam pressed "Advance" in admin. This derives the stage from the session counter so
// the label tracks the client's progress on its own: booking the Nth session of a block
// moves them to the stage that implies the (N-1)th is done.
//
// Deliberately conservative:
//   - FORWARD ONLY — never moves a client backward (Sam can still regress manually if a
//     state machine path is added; nothing here un-advances).
//   - BLOCK LADDER ONLY — leaves onboarding/retainer/graduated states untouched.
//   - Caps at `between-s3-s4`. The final hop to `post-s4-decision` means S4 was actually
//     *delivered* (not just booked), which the counter can't know — that stays on the
//     time-cron / manual advance.
'use strict';

const BLOCK_LADDER = ['pre-s1', 'between-s1-s2', 'between-s2-s3', 'between-s3-s4', 'post-s4-decision'];
const LADDER_INDEX = Object.fromEntries(BLOCK_LADDER.map((s, i) => [s, i]));

// Stage implied by N sessions consumed (booked). N=1 → pre-s1 (S1 booked, none done yet);
// N=2 → between-s1-s2 (S1 done); … capped at between-s3-s4 (index 3) — never post-s4 here.
function stageForSessionsUsed(used) {
  const idx = Math.max(0, Math.min((used || 0) - 1, 3));
  return BLOCK_LADDER[idx];
}

// Returns the new state if a forward advance on the block ladder is warranted, else null.
// Pure — caller persists.
function nextBlockStage(currentState, sessionsUsed) {
  const curIdx = LADDER_INDEX[currentState];
  if (curIdx === undefined) return null;           // not on the block ladder → leave alone
  const target = stageForSessionsUsed(sessionsUsed);
  return LADDER_INDEX[target] > curIdx ? target : null;
}

module.exports = { BLOCK_LADDER, stageForSessionsUsed, nextBlockStage };
