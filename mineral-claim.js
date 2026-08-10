// Self-contained ownership backfill for a mineral running TODAY's image.
// Mirrors engine/lib/mineral-identity.mjs exactly, but depends on nothing that
// only ships with the next image, so it can run on keith and test-org-4 now.
//   node backfill.js <email> [stateDir] [directoryUrl]
const fs = require('fs');
const crypto = require('crypto');

const email = String(process.argv[2] || '').toLowerCase();
const STATE = process.argv[3] || '/state';
const DIR = process.argv[4] || 'https://directory.crads-ai.com';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('usage: node backfill.js <your-email> [stateDir] [dirUrl]');
  process.exit(2);
}

const own = `${STATE}/ownership.json`;
let rec = {};
try { rec = JSON.parse(fs.readFileSync(own, 'utf8')); } catch { rec = {}; }

// 1. the serial: minted once, never regenerated
if (!/^min_[0-9a-f]{24}$/.test(String(rec.mineral_id || ''))) {
  rec.mineral_id = 'min_' + crypto.randomBytes(12).toString('hex');
}

// 2. the holder: first claim wins, and this IS the first claim
const already = rec.holder && rec.holder.kind === 'account' ? String(rec.holder.email || '') : '';
if (already && already !== email) {
  console.error(`ERROR: this mineral already records ${already} as its holder. A change of hands is a transfer, not a claim.`);
  process.exit(1);
}
rec.holder = { kind: 'account', account_id: String(rec.holder && rec.holder.account_id || ''), email };

// 3. the holder always has owner access; other grants are left untouched
rec.access = Array.isArray(rec.access) ? rec.access : [];
rec.access = rec.access.filter((g) => String(g.email || '').toLowerCase() !== email);
rec.access.unshift({ account_id: rec.holder.account_id || '', email, role: 'owner',
  granted: new Date().toISOString().slice(0, 10) });

fs.writeFileSync(own, JSON.stringify(rec, null, 2) + '\n');
console.log(`ownership.json: ${rec.mineral_id} held by ${email} (tier ${rec.tier || 'unknown'}, anchor ${rec.anchor || 'none'})`);

// 4. the mineral's own directory token, minted here if absent
const secrets = `${STATE}/secrets`;
const tokFile = `${secrets}/box_directory_token`;
let token = '';
try { token = fs.readFileSync(tokFile, 'utf8').trim(); } catch { token = ''; }
if (!token) {
  fs.mkdirSync(secrets, { recursive: true });
  token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokFile, token + '\n', { mode: 0o600 });
  console.log('minted this mineral\'s own directory token');
}
// owner_e too, so the existing enrol-sync guard passes on this image
try {
  fs.writeFileSync(`${secrets}/owner_e`,
    crypto.createHash('sha256').update(email).digest('hex') + '\n', { mode: 0o600 });
} catch { /* not fatal */ }

// 5. mirror it upward
const label = (() => { try { return fs.readFileSync(`${STATE}/box-name`, 'utf8').trim(); } catch { return ''; } })();
const host = (() => {
  try { return fs.readFileSync(`${STATE}/org-inbox.conf`, 'utf8').match(/^SLUG=(.*)$/m)[1].trim(); } catch { return require('os').hostname(); }
})();

(async () => {
  const body = {
    mineral_id: rec.mineral_id, label, host,
    tier: rec.tier === 'rock' ? 'rock' : 'pebble',
    anchor: rec.anchor || '',
    holder: rec.holder,
    access: rec.access,
  };
  let r;
  try {
    r = await fetch(`${DIR}/mineral-register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`the directory could not be reached (${e.message}); ownership is recorded on this mineral and will mirror on its next sync`);
    process.exit(0);
  }
  const out = await r.json().catch(() => ({}));
  if (r.ok) console.log(`OK: registered with the directory. This mineral now appears in ${email}'s account.`);
  else console.error(`the directory refused (${r.status}): ${out.error || ''}`);
})();
