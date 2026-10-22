// api/membership.js: the Crads membership checkout (2026-10-22).
//
// GET  -> { tier, price_aud, founding_left }: what a new member pays right now.
// POST -> { url }: a Stripe Checkout Session in subscription mode.
//   body: { email, name, agreed_terms: true, invite?: <token> }
//   With a valid invite (a setup buyer, link from Sam) the first 30 days are
//   included and no card is needed to start. Without one, billing starts today.
//
// Nothing books a Cal slot and nothing creates a site account: Slack, the
// drop-in and the library are set up by Sam (the cockpit's slack-renewals job
// sees the subscription in Stripe and stages his welcome steps).
'use strict';

const { client } = require('../lib/stripe');
const { TERMS_VERSION } = require('../lib/terms');
const { refFromCookie } = require('../lib/referrals');
const { cleanUtmSource, heardFromField } = require('../lib/attribution');
const { prices, foundingTaken, currentOffer, verifyInvite, sessionParams, FOUNDING_CAP } = require('../lib/membership');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIVE = ['active', 'trialing', 'past_due', 'unpaid'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || 'https://crads-ai.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

// Every subscription ever made on the founding price (Stripe pages at 100).
async function foundingSubs(stripe, priceId) {
  const out = [];
  let starting_after;
  for (let i = 0; i < 10; i++) {
    const page = await stripe.subscriptions.list({ price: priceId, status: 'all', limit: 100, ...(starting_after ? { starting_after } : {}) });
    out.push(...page.data);
    if (!page.has_more) return out;
    starting_after = page.data[page.data.length - 1].id;
  }
  return out;
}

async function offerNow(stripe) {
  const p = prices();
  if (!p.founding || !p.standard) throw new Error('membership prices not configured');
  const taken = foundingTaken(await foundingSubs(stripe, p.founding));
  const offer = currentOffer(taken, FOUNDING_CAP);
  return { ...offer, priceId: offer.tier === 'founding' ? p.founding : p.standard };
}

// Already a member (any live membership subscription under this email)?
async function isMember(stripe, email) {
  const p = prices();
  const mine = new Set([p.founding, p.standard]);
  const customers = await stripe.customers.list({ email, limit: 10 });
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 20 });
    if (subs.data.some((s) => LIVE.includes(s.status) && s.items.data.some((it) => mine.has(it.price.id)))) return true;
  }
  return false;
}

const referrerField = {
  key: 'referrer',
  label: { type: 'custom', custom: 'Who sent you? (optional)' },
  type: 'text',
  optional: true,
  text: { maximum_length: 100 },
};

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const stripe = module.exports._stripe || client();

  if (req.method === 'GET') {
    try {
      const { tier, price_aud, founding_left } = await offerNow(stripe);
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
      res.status(200).json({ tier, price_aud, founding_left, founding_cap: FOUNDING_CAP });
    } catch (err) {
      console.error('[membership] offer lookup failed', err && err.message);
      res.status(503).json({ error: 'unavailable' });
    }
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body;
  try { body = parseBody(req); } catch { res.status(400).json({ error: 'invalid_json' }); return; }

  let email = String(body.email || '').trim().toLowerCase();
  let included = false;
  if (body.invite) {
    const v = verifyInvite(String(body.invite), process.env.MEMBERSHIP_INVITE_SECRET);
    if (v.error) { res.status(400).json({ error: v.error }); return; }
    // The invite names the member; the form can't swap in another address.
    email = v.email;
    included = true;
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) { res.status(400).json({ error: 'invalid_email' }); return; }
  if (body.agreed_terms !== true) { res.status(400).json({ error: 'terms_not_accepted' }); return; }

  try {
    if (await isMember(stripe, email)) { res.status(409).json({ error: 'already_member' }); return; }
    const offer = await offerNow(stripe);
    const ref = refFromCookie(req.headers && req.headers.cookie);
    const params = sessionParams({
      priceId: offer.priceId,
      tier: offer.tier,
      email,
      included,
      baseUrl: process.env.BASE_URL || 'https://crads-ai.com',
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date().toISOString(),
      ref: ref ? ref.slug : '',
      refAt: ref ? ref.at : '',
      utmSource: cleanUtmSource(body.utm_source),
      referrerField,
      heardFromField: heardFromField(),
    });
    const session = await stripe.checkout.sessions.create(params);
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[membership] checkout failed', err && err.message);
    res.status(502).json({ error: 'checkout_failed' });
  }
};
