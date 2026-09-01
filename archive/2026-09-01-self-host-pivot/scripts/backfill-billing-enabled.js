// scripts/backfill-billing-enabled.js — grandfather the owners of LIVE boxes
// as billing_enabled (Sam, 2026-08-23 Q11: "existing members can be marked as
// yes"). Enumerated from METAL, never from Stripe subscriptions: the ~25 zombie
// subs left by the 10 Aug wipe must not grandfather anyone.
//
//   HCLOUD_TOKEN=... node scripts/backfill-billing-enabled.js            # dry run
//   HCLOUD_TOKEN=... node scripts/backfill-billing-enabled.js --apply    # write
//
// Owners come from the cockpit's builder record (arrivals-fulfilled.json:
// slug -> owner email) joined with Hetzner's running servers (aios-<slug>).
// Pass --arrivals <path> when not running on the VPS. REDIS_URL must be set.
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const { defaultKv } = require('../lib/kv');
const { directoryFor } = require('../lib/directory');

const APPLY = process.argv.includes('--apply');
const argOf = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : null; };
const ARRIVALS = argOf('--arrivals') || '/home/sam/second-brain/cockpit/data/arrivals-fulfilled.json';

(async () => {
  if (!process.env.HCLOUD_TOKEN) { console.error('HCLOUD_TOKEN not set'); process.exit(1); }
  const servers = JSON.parse(execFileSync('curl', ['-4', '-sS', '-m', '15', '-H', `Authorization: Bearer ${process.env.HCLOUD_TOKEN}`,
    'https://api.hetzner.cloud/v1/servers?per_page=50'], { encoding: 'utf8' })).servers || [];
  const live = new Set(servers.map((s) => String(s.name || '').replace(/^aios-/, '')));
  const fulfilled = Object.values(JSON.parse(fs.readFileSync(ARRIVALS, 'utf8')).fulfilled || {});
  const owners = new Map(); // email -> [slugs]
  for (const r of fulfilled) {
    if (!r || !r.slug || !r.email || !live.has(r.slug)) continue;
    const em = String(r.email).toLowerCase();
    owners.set(em, [...(owners.get(em) || []), r.slug]);
  }
  console.log(`${live.size} live servers, ${owners.size} owners to grandfather`);

  const kv = defaultKv();
  let changed = 0;
  for (const [email, slugs] of owners) {
    const user = await kv.getUser(email);
    if (!user) { console.log(`  ${email}: NO ACCOUNT on the site (holds ${slugs.join(', ')}); skipped, they flip it themselves at first sign-in`); continue; }
    if (user.billing_enabled) { console.log(`  ${email}: already on`); continue; }
    console.log(`  ${email}: billing_enabled -> true (${slugs.join(', ')})${APPLY ? '' : '  [dry run]'}`);
    if (APPLY) {
      user.billing_enabled = true;
      user.billing_enabled_at = Date.now();
      user.billing_enabled_by = 'backfill-2026-08-23';
      await kv.setUser(email, user);
      // mirror onto every rock they hold (licence:<org>), same as the page does
      const dir = directoryFor(user);
      const held = await dir.minerals().catch(() => ({ ok: false }));
      for (const m of (held.ok ? held.minerals : [])) {
        if (m.held_by === 'you' && m.tier === 'rock') {
          const r = await dir.setLicence(m.mineral_id).catch((e) => ({ ok: false, reason: String(e) }));
          console.log(`    licence ${m.org || m.host}: ${r.ok ? r.status : 'FAILED ' + r.reason}`);
        }
      }
    }
    changed++;
  }
  console.log(`${APPLY ? 'wrote' : 'would write'} ${changed} account(s)`);
  if (typeof kv.quit === 'function') await kv.quit();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
