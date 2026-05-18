// api/booking-status.js — polled by /thanks; reports if Cal has the booking
'use strict';

const { findBookingByStripeSession } = require('../lib/cal');

// Cal v2 booking statuses we treat as "the booking exists and will happen":
//   ACCEPTED, AWAITING_HOST. Everything else (CANCELLED, REJECTED, PENDING)
//   does NOT confirm to the customer that the slot is theirs.
const ACCEPTED_STATUSES = /^(accepted|awaiting_host)$/i;
const REFUNDED_STATUSES = /^(cancelled|rejected|refunded)$/i;

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const { session_id } = req.query;
  if (!session_id) { res.status(400).json({ error: 'missing_session_id' }); return; }

  const cal = await findBookingByStripeSession(session_id);
  if (!cal.ok) {
    // Don't leak Cal's error body to the public caller
    res.status(502).json({ error: 'upstream' });
    return;
  }
  const bookings = (cal.body && cal.body.data) || [];
  const confirmed = bookings.some(b => ACCEPTED_STATUSES.test(b.status || ''));
  const refunded = bookings.some(b => REFUNDED_STATUSES.test(b.status || ''));
  res.status(200).json({ confirmed, refunded });
};
