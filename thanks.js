// thanks.js — polls booking-status until confirmed or race-loss
(function () {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const type = params.get('type');
  const header = document.getElementById('header');
  const subhead = document.getElementById('subhead');
  const confirmation = document.getElementById('confirmation');

  if (type === 'discovery') {
    header.textContent = 'Discovery call booked.';
    subhead.textContent = '';
    confirmation.style.display = 'block';
    return;
  }
  if (!sessionId) {
    header.textContent = 'No session info.';
    subhead.textContent = 'If you just paid, check email for the receipt. Otherwise return to the booking page.';
    return;
  }

  let attempts = 0;
  const maxAttempts = 15; // 15 × 2s = 30s

  async function poll() {
    attempts++;
    try {
      const res = await fetch(`/api/booking-status?session_id=${encodeURIComponent(sessionId)}`);
      const json = await res.json();
      if (json.refunded) {
        window.location.href = '/booking-failed';
        return;
      }
      if (json.confirmed) {
        header.textContent = 'Booking confirmed.';
        subhead.textContent = '';
        confirmation.style.display = 'block';
        return;
      }
    } catch (err) { /* retry */ }
    if (attempts >= maxAttempts) {
      header.textContent = 'Still processing…';
      subhead.innerHTML = 'Booking is taking longer than expected. Email <a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a> with your receipt and I\'ll sort it manually.';
      return;
    }
    setTimeout(poll, 2000);
  }
  poll();
})();
