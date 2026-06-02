'use strict';
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { handleOnboardingStep } = require('../../lib/onboardingStep');

function parseFormBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  let raw = '';
  if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.body === 'string') raw = req.body;
  else return {};

  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  // urlencoded
  const out = {};
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const k = decodeURIComponent((idx >= 0 ? pair.slice(0, idx) : pair).replace(/\+/g, ' '));
    const v = idx >= 0 ? decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' ')) : '';
    if (k in out) {
      if (Array.isArray(out[k])) out[k].push(v);
      else out[k] = [out[k], v];
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('method_not_allowed');
    return;
  }
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;

  const body = parseFormBody(req);
  const result = await handleOnboardingStep({ kv, user, body });

  if (result.redirectTo) {
    res.redirect(302, result.redirectTo);
    return;
  }
  res.status(result.status || 400).send(result.error || 'bad_request');
};
