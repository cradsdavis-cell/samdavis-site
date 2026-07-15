// scripts/seed-existing-clients.js
'use strict';
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { Resend } = require('resend');
const { createOrUpdateUser } = require('../lib/createOrUpdateUser');
const { defaultKv } = require('../lib/kv');

const resend = new Resend(process.env.RESEND_API_KEY);
const kvWrapped = defaultKv();

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

  // For backfill: skip welcome emails. Existing clients shouldn't get
  // a "Welcome to crads-ai!" email when they've been working with Sam for weeks.
  // Pass resend=null so createOrUpdateUser's email-send guard short-circuits.
  // Sam can use /account/admin "Resend welcome magic link" for selective re-sends.
  const SKIP_WELCOME_EMAIL = true;

  for (const row of rows) {
    const { email, name, stripe_customer_id, initial_state } = row;
    if (!email) continue;
    console.log(`Seeding: ${email}`);
    const { created, user } = await createOrUpdateUser({
      kv: kvWrapped,
      resend: SKIP_WELCOME_EMAIL ? null : resend,
      email, name, stripeCustomerId: stripe_customer_id || null,
      sku: 'coaching-block',
      stripeSessionId: null,
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
  console.log('\nDone. No welcome emails sent (backfill mode). Use /account/admin to send individual magic links.');
  process.exit(0); // ioredis keeps connection alive otherwise
}

main().catch(e => { console.error(e); process.exit(1); });
