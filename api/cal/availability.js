// api/cal/availability.js — proxies Cal slot lookup, keeps API key server-side
'use strict';

const { getAvailableSlots } = require('../../lib/cal');
const { getSku, DISCOVERY_EVENT_TYPE_ID } = require('../../lib/skus');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const { sku, startDate, endDate } = req.query;
  if (!sku || !startDate || !endDate) {
    res.status(400).json({ error: 'missing_params', required: ['sku', 'startDate', 'endDate'] });
    return;
  }
  let eventTypeId;
  if (sku === 'discovery') {
    eventTypeId = DISCOVERY_EVENT_TYPE_ID();
  } else {
    try { eventTypeId = getSku(sku).cal_event_type_id; }
    catch { res.status(400).json({ error: 'unknown_sku' }); return; }
  }
  const cal = await getAvailableSlots({ eventTypeId, startDate, endDate });
  if (!cal.ok) {
    res.status(502).json({ error: 'cal_upstream', status: cal.status, body: cal.body });
    return;
  }
  const slotsByDate = (cal.body && cal.body.data && cal.body.data.slots) || cal.body;
  res.status(200).json({ slots: slotsByDate });
};
