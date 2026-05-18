// api/cal/availability.js — proxies Cal slot lookup, keeps API key server-side
'use strict';

const { getAvailableSlots } = require('../../lib/cal');
const { getSku, DISCOVERY_EVENT_TYPE_ID } = require('../../lib/skus');

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
      eventTypeId = getSku(sku).cal_event_type_id;
    }
  } catch (e) {
    res.status(400).json({ error: 'unknown_sku' });
    return;
  }

  const cal = await getAvailableSlots({ eventTypeId, startDate, endDate });
  if (!cal.ok) {
    console.error('[availability] Cal upstream error', cal.status, cal.body);
    res.status(502).json({ error: 'upstream' });
    return;
  }
  const slotsByDate = (cal.body && cal.body.data && cal.body.data.slots) || cal.body;
  // Slot availability is dynamic but changes-per-minute, not per-second.
  // 60s public cache cuts Cal API quota burn from polling clients.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.status(200).json({ slots: slotsByDate });
};
