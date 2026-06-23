// scripts/backfill-session-balance.js — stamp sessions_total/sessions_used onto existing
// engagements that predate the balance counter.
//
//   node scripts/backfill-session-balance.js          # dry run (prints what would change)
//   node scripts/backfill-session-balance.js --apply   # write changes to Redis
//
// Legacy records get a sensible default (a completed block = fully used; an active block =
// its checkout-booked first session used). These are starting points — verify the real
// remaining for each active client in /account/admin and correct with the balance editor.
// REDIS_URL must be set in the environment.
'use strict';

const { defaultKv } = require('../lib/kv');
const { sessionsForSku, initialSessionsUsed } = require('../lib/sessionBalance');

const APPLY = process.argv.includes('--apply');

(async () => {
  const kv = defaultKv();
  const users = await kv.listUsers();
  let changedUsers = 0, changedEngagements = 0;

  for (const user of users) {
    let dirty = false;
    for (const e of user.engagements || []) {
      const total = sessionsForSku(e.type);
      if (typeof e.sessions_total !== 'number' && total !== null) { e.sessions_total = total; dirty = true; changedEngagements++; }
      if (typeof e.sessions_used !== 'number') {
        e.sessions_used = e.completed ? (typeof total === 'number' ? total : 0) : initialSessionsUsed(e.type);
        dirty = true;
      }
    }
    if (dirty) {
      changedUsers++;
      const summary = (user.engagements || []).map(e => `${e.type}:${e.sessions_used}/${e.sessions_total}${e.completed ? ' done' : ''}`).join(', ');
      console.log(`${APPLY ? 'WRITE' : 'WOULD WRITE'}  ${user.email}  [${summary}]`);
      if (APPLY) await kv.setUser(user.email, user);
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Dry run'}: ${changedUsers} user(s), ${changedEngagements} engagement(s) needing sessions_total.`);
  if (!APPLY) console.log('Re-run with --apply to write.');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
