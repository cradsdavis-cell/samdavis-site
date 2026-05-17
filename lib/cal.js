// lib/cal.js — Cal.com API v2 wrapper
'use strict';

const CAL_API_BASE = 'https://api.cal.com/v2';

async function calFetch(path, options = {}) {
  const res = await fetch(`${CAL_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-08-13',
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
      attendee: { name, email, timeZone: 'Australia/Sydney', language: 'en' },
      metadata: { stripe_session_id: stripeSessionId, sku },
    }),
  });
}

async function findBookingByStripeSession(stripeSessionId) {
  // Cal v2 /bookings does NOT support filtering by metadata.* server-side
  // (the query param is silently ignored and the full list is returned).
  // Fetch most-recent bookings and filter client-side by stripe_session_id.
  const params = new URLSearchParams({ sortCreated: 'desc', take: '100' });
  const resp = await calFetch(`/bookings?${params.toString()}`);
  if (!resp.ok) return resp;
  const all = (resp.body && resp.body.data) || [];
  const matches = all.filter(b => b.metadata && b.metadata.stripe_session_id === stripeSessionId);
  return { ok: true, status: resp.status, body: { ...resp.body, data: matches } };
}

module.exports = { calFetch, getAvailableSlots, createBooking, findBookingByStripeSession };
