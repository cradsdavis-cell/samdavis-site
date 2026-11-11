// lib/partners.js: booking codes that belong to a partner who sends people to
// the roadmap (2026-11-11). The code still does the discounting in Stripe; this
// only says who sent the booker, so the booking page (via /api/code) and the
// roadmap confirmation email can name them and say they'll join the calls.
//
// Not the A$100 host scheme in lib/referrals.js: a partner's share comes from
// their own written agreement with Sam, so these codes are deliberately NOT
// registered as ref_code:* in KV (that would record an A$100 fee as owed).
'use strict';

const PARTNERS = [
  {
    id: 'max',
    // MAJORDOME for one-to-one messages; MAJ-01, MAJ-02... one per post or group.
    match: (code) => code === 'MAJORDOME' || /^MAJ-\d{1,3}$/.test(code),
    name: 'Max Debus',
    org: 'Majordome',
    pageLine: "Max Debus from Majordome sent you here. Max and I work together on AI builds, so he'll join both of your roadmap calls.",
    emailLine: 'Max Debus from Majordome, who sent you my way, will join both calls too. He and I work together on AI builds.',
  },
];

function partnerForCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return PARTNERS.find((p) => p.match(c)) || null;
}

module.exports = { partnerForCode, PARTNERS };
