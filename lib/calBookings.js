'use strict';

async function fetchBookings(email) {
  const apiKey = process.env.CAL_API_KEY;
  const url = `https://api.cal.com/v2/bookings?attendeeEmail=${encodeURIComponent(email)}`;
  const r = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'cal-api-version': '2024-08-13',
    },
  });
  if (!r.ok) throw new Error(`Cal API ${r.status}`);
  const data = await r.json();
  return (data && data.data) || [];
}

async function fetchNextSession(email) {
  const bookings = await fetchBookings(email);
  const now = new Date();
  const upcoming = bookings
    .filter(b => String(b.status).toUpperCase() === 'ACCEPTED' && new Date(b.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (!upcoming.length) return null;
  const next = upcoming[0];
  return { date: next.start, label: next.eventType && next.eventType.title };
}

async function fetchUpcomingAndPast(email) {
  const bookings = await fetchBookings(email);
  const now = new Date();
  const upcoming = bookings
    .filter(b => String(b.status).toUpperCase() === 'ACCEPTED' && new Date(b.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const past = bookings
    .filter(b => new Date(b.start) <= now)
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  return { upcoming, past };
}

function calManageUrl(uid) {
  return `https://cal.com/booking/${uid}`;
}

module.exports = { fetchBookings, fetchNextSession, fetchUpcomingAndPast, calManageUrl };
