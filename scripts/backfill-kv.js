// scripts/backfill-kv.js
// One-off, IDEMPOTENT backfill for historical KV data gaps in the coaching client store.
//
// WHY: a couple of records predate / dodged the engagements model, so the
// /api/admin/users-state snapshot (read by the second-brain EA's coaching-reconcile
// sync) under-reports billing truth:
//   - Alex Mills paid A$500 for a coaching block on 2026-05-19 (Stripe PI
//     pi_3TYapq2MeTK4rlQY0evivSa0) but his engagements[] is empty — the payment
//     predates the engagements model, so the webhook never recorded it.
//
// This writes ONLY missing facts. It never overwrites an engagement that already
// exists, and it only moves `state` FORWARD through the known arc (never regresses,
// never invents a state). Session arc (S1-S4) is otherwise owned by the EA's
// wiki / Coaching tab, not by the site `state`, so ambiguous cases are left alone:
//   - Samantha Philpot's state is frozen at the 2026-06-03 seed but she has since
//     started a SECOND block; the linear `state` machine can't model "block 2",
//     so her state is intentionally NOT touched here — set it via /account/admin.
//
// Run:  cd samdavis-site && node scripts/backfill-kv.js          # dry-run (prints the plan)
//       cd samdavis-site && APPLY=1 node scripts/backfill-kv.js  # writes to Redis
// Needs REDIS_URL in the environment (.env.local or `vercel env pull`).
'use strict';
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} catch { /* dotenv optional — fall back to ambient env (e.g. `vercel env pull`) */ }

const { defaultKv } = require('../lib/kv');

const APPLY = process.env.APPLY === '1';

// Keyed by email. `ensureEngagement` adds the engagement only if none of that
// `type` already exists. `advanceState` only moves state forward through ARC_ORDER.
const BACKFILLS = [
  {
    email: 'hello@alexmillssocial.com',
    ensureEngagement: {
      type: 'coaching-block',
      purchased_at: '2026-05-19T00:00:00.000Z',
      completed: false,                                  // S3 delivered, S4 still pending
      amount_aud: 500,                                   // old $500 block (pre price-raise)
      stripe_payment_intent: 'pi_3TYapq2MeTK4rlQY0evivSa0',
      backfilled_at: '2026-06-17',
      backfill_note: 'Paid pre-engagements-model; webhook never recorded the engagement.',
    },
    advanceState: 'between-s3-s4',                        // forward-only; matches EA wiki delivery log
  },
];

const ARC_ORDER = [
  'onboarding-incomplete', 'onboarding-complete', 'pre-s1',
  'between-s1-s2', 'between-s2-s3', 'between-s3-s4',
  'post-s4-decision', 'retainer-active', 'graduated',
];
const isForward = (from, to) => {
  const a = ARC_ORDER.indexOf(from), b = ARC_ORDER.indexOf(to);
  return a >= 0 && b >= 0 && b > a;
};

async function main() {
  const kv = defaultKv();
  let changed = 0;

  for (const b of BACKFILLS) {
    const user = await kv.getUser(b.email);
    if (!user) { console.log(`SKIP ${b.email} — no KV record`); continue; }
    user.engagements = user.engagements || [];
    const actions = [];

    if (b.ensureEngagement) {
      const has = user.engagements.some((e) => e.type === b.ensureEngagement.type);
      if (has) {
        actions.push(`engagement '${b.ensureEngagement.type}' already present — leave`);
      } else {
        actions.push(`ADD engagement '${b.ensureEngagement.type}' (A$${b.ensureEngagement.amount_aud}, ${b.ensureEngagement.purchased_at})`);
        if (APPLY) user.engagements.push({ ...b.ensureEngagement });
      }
    }

    if (b.advanceState) {
      if (user.state === b.advanceState) {
        actions.push(`state already '${b.advanceState}' — leave`);
      } else if (isForward(user.state, b.advanceState)) {
        actions.push(`ADVANCE state '${user.state}' -> '${b.advanceState}'`);
        if (APPLY) { user.state = b.advanceState; user.state_updated_at = new Date().toISOString(); }
      } else {
        actions.push(`state '${user.state}' is NOT behind '${b.advanceState}' — leave (no regress)`);
      }
    }

    const willWrite = APPLY && actions.some((a) => a.startsWith('ADD') || a.startsWith('ADVANCE'));
    if (willWrite) { await kv.setUser(b.email, user); changed++; }
    console.log(`${b.email}:`);
    actions.forEach((a) => console.log(`  - ${a}`));
  }

  console.log(`\n${APPLY ? `Applied — ${changed} record(s) written.` : 'DRY RUN — no writes. Re-run with APPLY=1 to persist.'}`);
  process.exit(0); // ioredis keeps the socket open otherwise
}

main().catch((e) => { console.error(e); process.exit(1); });
