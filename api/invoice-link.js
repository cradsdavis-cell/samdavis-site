// api/invoice-link.js — fetched by /thanks once the booking is confirmed;
// returns the Stripe-hosted invoice page for a paid checkout session.
// The session id is Stripe's unguessable token from the success_url, the
// same token that already gates /api/booking-status.
'use strict';

const { invoiceForSession } = require('../lib/stripe');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const { session_id } = req.query;
  if (!session_id || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(session_id)) {
    res.status(400).json({ error: 'bad_session_id' });
    return;
  }
  try {
    const invoice = await invoiceForSession(session_id);
    res.status(200).json(invoice ? { invoice } : { invoice: null });
  } catch {
    // Don't leak Stripe's error body to the public caller
    res.status(502).json({ error: 'upstream' });
  }
};
