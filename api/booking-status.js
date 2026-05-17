// api/booking-status.js — polled by /thanks; reports if Cal has the booking
'use strict';

const { findBookingByStripeSession } = require('../lib/cal');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const { session_id } = req.query;
  if (!session_id) { res.status(400).json({ error: 'missing_session_id' }); return; }
  const cal = await findBookingByStripeSession(session_id);
  if (!cal.ok) { res.status(502).json({ error: 'cal_upstream', status: cal.status }); return; }
  const bookings = (cal.body && cal.body.data) || [];
  const confirmed = bookings.length > 0;
  const refunded = bookings.some(b => /cancelled|refunded/i.test(b.status || ''));
  res.status(200).json({ confirmed, refunded });
};
