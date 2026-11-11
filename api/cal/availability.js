// api/cal/availability.js — proxies Cal slot lookup, keeps API key server-side
'use strict';

const { getAvailableSlots, getPublicSlots } = require('../../lib/cal');
const { partnerForCode, partnerCal, intersectSlots } = require('../../lib/partners');
const { calEventTypeIdFor, DISCOVERY_EVENT_TYPE_ID } = require('../../lib/skus');

const MAX_WINDOW_MS = 31 * 86400000; // 31 days
const PAST_TOLERANCE_MS = 5 * 60 * 1000; // accept startDate up to 5 min in the past (clock skew)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || 'https://crads-ai.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const { sku, startDate, endDate } = req.query;
  if (!sku || !startDate || !endDate) {
    res.status(400).json({ error: 'missing_params', required: ['sku', 'startDate', 'endDate'] });
    return;
  }
  // v5: a SKU's sessions have different lengths, so the portal asks for session
  // N's slots. Public /book pages omit it: checkout always books session 1.
  const session = req.query.session === undefined ? 1 : parseInt(String(req.query.session), 10);
  if (!(session >= 1)) {
    res.status(400).json({ error: 'invalid_session' });
    return;
  }

  // Date sanity bounds
  const startMs = Date.parse(startDate);
  const endMs = Date.parse(endDate);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    res.status(400).json({ error: 'invalid_date_format' });
    return;
  }
  if (endMs <= startMs) {
    res.status(400).json({ error: 'invalid_date_range' });
    return;
  }
  if (endMs - startMs > MAX_WINDOW_MS) {
    res.status(400).json({ error: 'window_too_large', max_days: 31 });
    return;
  }
  if (endMs < Date.now() - PAST_TOLERANCE_MS) {
    res.status(400).json({ error: 'window_in_past' });
    return;
  }

  let eventTypeId;
  try {
    if (sku === 'discovery') {
      eventTypeId = DISCOVERY_EVENT_TYPE_ID();
    } else {
      // purchasable or legacy: a mid-engagement client's portal picker uses this too
      eventTypeId = calEventTypeIdFor(sku, session);
    }
  } catch (e) {
    res.status(400).json({ error: /has \d+ sessions, not/.test(e && e.message) ? 'invalid_session' : 'unknown_sku' });
    return;
  }

  const cal = await getAvailableSlots({ eventTypeId, startDate, endDate });
  if (!cal.ok) {
    console.error('[availability] Cal upstream error', cal.status, cal.body);
    res.status(502).json({ error: 'upstream' });
    return;
  }
  let slotsByDate = (cal.body && cal.body.data && cal.body.data.slots) || cal.body;

  // A partner's code on the link (2026-11-11): only the times both Sam and the
  // partner are free. If the partner's calendar can't be read, Sam's times
  // stand (checkout checks again) rather than an empty page.
  const pcal = sku === 'roadmap' ? partnerCal(partnerForCode(req.query.code)) : null;
  if (pcal) {
    try {
      const theirs = await getPublicSlots({ ...pcal, startDate, endDate });
      if (theirs.ok) slotsByDate = intersectSlots(slotsByDate, theirs.body.data);
      else console.error('[availability] partner slots error', theirs.status, JSON.stringify(theirs.body).slice(0, 300));
    } catch (err) {
      console.error('[availability] partner slots failed', err && err.message);
    }
  }
  // Slot availability is dynamic but changes-per-minute, not per-second.
  // 60s public cache cuts Cal API quota burn from polling clients.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.status(200).json({ slots: slotsByDate });
};
