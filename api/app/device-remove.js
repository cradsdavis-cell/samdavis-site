'use strict';
// POST /api/app/device-remove — stage a machine-key removal with the mineral
// (W1). The mineral verifies the manage-scoped token on its own disk and
// applies the removal itself; this handler only asks and relays the answer.
//
// IT NOW RELAYS THE ANSWER (findings 144 and 162, 2026-08-16). Until today it
// staged the ask and redirected with NOTHING: on success the page reloaded
// unchanged, and when the mineral refused, its reason went into
// `revokedone:<host>:<slug>` where no code on this site had ever looked. A
// member pressed Remove on their only machine, was refused with a genuinely good
// reason, and ten minutes later still read "1 machine" with no explanation.
// Pressing it a second time was just as silent.
//
// THE RULE THAT NOW HOLDS: this handler reads what the mineral said about THIS
// machine before asking again, and carries the mineral's own words back to the
// page. Not the site's paraphrase of them: the box is the authority on why it
// refused, and it already writes a better sentence than this file would.
//
// IT STILL ASKS. A refusal is a fact about the last attempt, never a standing
// verdict: the reason the box gave ("add another computer first") describes a
// state the member can change, and a site that declined to re-ask would be
// second-guessing the only party that gets a vote. So the prior refusal is
// reported AND the fresh ask goes in.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { directoryFor } = require('../../lib/directory');
const { lastDeviceOutcome } = require('../../lib/custodyOutcomes');

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e4) req.destroy(); });
    req.on('end', () => {
      try { resolve(Object.fromEntries(new URLSearchParams(raw))); } catch { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('method not allowed');
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;
  const body = await parseBody(req);
  const mineralId = String(body.mineral_id || '');
  const slug = String(body.slug || '');
  const dir = directoryFor(user);

  // READ BEFORE ASKING, so the message describes the state the member is acting
  // from rather than the state their own click just created. Staging writes
  // `revokereq:` and never clears `revokedone:`, so the order does not change
  // WHICH record is found; it changes what the sentence can honestly claim.
  //
  // Fail-soft on purpose: a directory that cannot answer this must never stop a
  // removal. Losing the explanation is bad, losing the ability to cut off a lost
  // laptop is worse.
  const before = await dir.custodyStatus(mineralId).catch(() => ({ ok: false }));
  const prior = before.ok ? lastDeviceOutcome(before, slug) : null;

  const r = await dir.revokeDevice(mineralId, slug);

  let msg = '';
  let bad = false;
  if (!r.ok) {
    bad = true;
    msg = r.reason || 'the removal could not be staged';
  } else if (prior && prior.outcome === 'refused') {
    // `bad=1` deliberately: this is the news the member never got. The wording
    // is past tense about the refusal and present tense about the fresh ask,
    // because the refusal may well be out of date (adding a second machine is
    // exactly what the box asked for) and a red box that reads as a standing
    // "no" would be its own lie.
    bad = true;
    msg = prior.reason
      ? `Last time you asked, the mineral refused: ${prior.reason}. Asked again just now, in case that has changed.`
      : 'Last time you asked, the mineral refused, and it recorded no reason. Asked again just now, in case that has changed.';
  } else {
    msg = `Asked. ${r.note || 'the mineral applies this itself, usually within a couple of minutes'}. The answer appears under Recent changes.`;
  }

  // back to the page either way: it renders roster truth, and the removal
  // shows once the mineral has applied it.
  //
  // Devices was folded into Access and deleted (2026-08-13); removal is
  // initiated there, so that is where the outcome belongs. access.js reads
  // ?msg= and ?bad= and caps the message at 400 characters, which the worker's
  // own 200-character cap on a reason keeps this well inside.
  res.statusCode = 303;
  res.setHeader('Location', `/app/access?${bad ? 'bad=1&' : ''}msg=${encodeURIComponent(msg)}`);
  return res.end();
};
