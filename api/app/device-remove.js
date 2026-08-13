'use strict';
// POST /api/app/device-remove — stage a machine-key removal with the mineral
// (W1). The mineral verifies the manage-scoped token on its own disk and
// applies the removal itself; this handler only asks and relays the answer.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { directoryFor } = require('../../lib/directory');

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
  const r = await directoryFor(user).revokeDevice(String(body.mineral_id || ''), String(body.slug || ''));
  // back to the page either way: it renders roster truth, and the removal
  // shows once the mineral has applied it
  res.statusCode = 303;
  // Devices was folded into Access and deleted (2026-08-13); removal is
  // initiated there, so that is where the outcome belongs.
  res.setHeader('Location', r.ok ? '/app/access' : `/app/access?bad=1&msg=${encodeURIComponent(r.reason || 'the removal could not be staged')}`);
  return res.end();
};
