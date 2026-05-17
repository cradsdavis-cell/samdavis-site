// lib/cal.js — Cal.com API v2 wrapper
'use strict';

const CAL_API_BASE = 'https://api.cal.com/v2';

async function calFetch(path, options = {}) {
  const res = await fetch(`${CAL_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, ok: res.ok, body };
}

async function getAvailableSlots({ eventTypeId, startDate, endDate, timeZone = 'Australia/Sydney' }) {
  const params = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    startTime: startDate,
    endTime: endDate,
    timeZone,
  });
  return calFetch(`/slots/available?${params.toString()}`);
}

async function createBooking({ eventTypeId, slotIso, name, email, stripeSessionId, sku }) {
  return calFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      eventTypeId,
      start: slotIso,
      attendee: { name, email, timeZone: 'Australia/Sydney' },
      metadata: { stripe_session_id: stripeSessionId, sku },
    }),
  });
}

async function findBookingByStripeSession(stripeSessionId) {
  const params = new URLSearchParams({ 'metadata.stripe_session_id': stripeSessionId });
  return calFetch(`/bookings?${params.toString()}`);
}

module.exports = { calFetch, getAvailableSlots, createBooking, findBookingByStripeSession };
