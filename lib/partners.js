// lib/partners.js: booking codes that belong to a partner who sends people to
// the roadmap (2026-11-11). The code still does the discounting in Stripe; this
// says who sent the booker, so the booking page (via /api/code) and the roadmap
// confirmation email can name them and say they'll join the calls.
//
// Since 2026-11-11 (second pass) a partner can also have:
//   - a Cal.com event (env, "username/event-slug"): the booking page then only
//     offers times when both Sam and the partner are free, and checkout refuses
//     a time the partner is busy for (a code typed on the form, not the link);
//   - an email (env): added as a guest on the Cal booking, so the partner gets
//     the calendar invite and the Meet link.
// Both live in Vercel env vars, never here: this repo is public.
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
    name: 'Maxime Debus',
    org: 'Majordome',
    // Maxime's mascot mark, from majordome.agency (used with his OK).
    logo: '/lib/img/partners/majordome-mark.svg',
    calEnv: 'PARTNER_MAX_CAL',        // e.g. "maxime-debus/roadmap"
    guestEmailEnv: 'PARTNER_MAX_EMAIL',
    pageLine: "Maxime Debus from Majordome sent you here. He and I work together on AI builds, so he'll join both of your roadmap calls.",
    emailLine: 'Maxime Debus from Majordome, who sent you my way, will join both calls too. He and I work together on AI builds.',
  },
];

const LOGO_RE = /^\/lib\/img\/partners\/[a-z0-9-]+\.(svg|png)$/;
const CAL_RE = /^([a-z0-9][a-z0-9._-]{0,62})\/([a-z0-9][a-z0-9-]{0,62})$/i;
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;

function partnerForCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return PARTNERS.find((p) => p.match(c)) || null;
}

// What /api/code hands the booking page: the line, plus the partner's logo
// when there is one (a site path under /lib/img/partners/, never a URL).
function partnerForPage(p) {
  if (!p) return undefined;
  const out = { line: p.pageLine };
  if (p.logo && LOGO_RE.test(p.logo)) {
    out.logo = p.logo;
    out.logo_alt = p.org;
  }
  return out;
}

// The partner's Cal.com event, from env: { username, eventTypeSlug } or null.
function partnerCal(p, env = process.env) {
  if (!p || !p.calEnv) return null;
  const m = CAL_RE.exec(String(env[p.calEnv] || '').trim());
  return m ? { username: m[1], eventTypeSlug: m[2] } : null;
}

// The partner's email for the Cal guest list, from env, or null.
function partnerGuestEmail(p, env = process.env) {
  if (!p || !p.guestEmailEnv) return null;
  const e = String(env[p.guestEmailEnv] || '').trim();
  return EMAIL_RE.test(e) ? e : null;
}

// Keep only Sam's slots whose start is also a start in the partner's slots.
// sam: { date: [{ time }] } (Cal /slots/available); partner: { date: [{ start }] }
// (Cal public /slots). Compared as instants, so offsets and zones don't matter.
function intersectSlots(sam, partner) {
  const free = new Set();
  for (const list of Object.values(partner || {})) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      const t = Date.parse(typeof s === 'string' ? s : (s && s.start));
      if (!Number.isNaN(t)) free.add(t);
    }
  }
  const out = {};
  for (const [date, list] of Object.entries(sam || {})) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((s) => free.has(Date.parse(typeof s === 'string' ? s : (s && s.time))));
    if (kept.length) out[date] = kept;
  }
  return out;
}

// Is this instant one of the partner's free starts?
function slotInPartnerSlots(slotIso, partner) {
  const t = Date.parse(slotIso);
  if (Number.isNaN(t)) return false;
  for (const list of Object.values(partner || {})) {
    if (!Array.isArray(list)) continue;
    if (list.some((s) => Date.parse(typeof s === 'string' ? s : (s && s.start)) === t)) return true;
  }
  return false;
}

module.exports = { partnerForCode, partnerForPage, partnerCal, partnerGuestEmail, intersectSlots, slotInPartnerSlots, PARTNERS };
