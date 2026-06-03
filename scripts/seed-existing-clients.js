// scripts/seed-existing-clients.js
'use strict';
const fs = require('fs');
const path = require('path');
const { kv } = require('@vercel/kv');
const { Resend } = require('resend');
const { createOrUpdateUser } = require('../lib/createOrUpdateUser');
const { makeKv } = require('../lib/kv');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);
const kvWrapped = makeKv(kv);

async function main() {
  const csvPath = path.join(__dirname, 'seed-clients.csv');
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    const fields = line.split(',');
    const obj = {};
    header.forEach((h, i) => { obj[h.trim()] = (fields[i] || '').trim(); });
    return obj;
  });

  for (const row of rows) {
    const { email, name, stripe_customer_id, initial_state, cohort_id } = row;
    if (!email) continue;
    console.log(`Seeding: ${email}`);
    const { created, user } = await createOrUpdateUser({
      kv: kvWrapped, resend,
      email, name, stripeCustomerId: stripe_customer_id || null,
      sku: 'coaching-block',
      stripeSessionId: null,
      cohortId: cohort_id || null,
    });
    if (initial_state && initial_state !== 'onboarding-incomplete') {
      user.state = initial_state;
      user.state_updated_at = new Date().toISOString();
      user.onboarding.completed = true; // existing clients have effectively completed onboarding
      user.onboarding.step = 4;
      await kvWrapped.setUser(email, user);
    }
    console.log(`  ${created ? 'created' : 'updated'} — state: ${user.state}`);
  }
  console.log('\nDone. Welcome magic links sent to new records.');
}

main().catch(e => { console.error(e); process.exit(1); });
