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
    header.classList.remove('polling');
    subhead.textContent = '';
    confirmation.style.display = 'block';
    return;
  }
  if (!sessionId) {
    header.textContent = 'No session info.';
    subhead.textContent = 'If you just paid, check email for the receipt. Otherwise return to the booking page.';
    return;
  }

  // The invoice link (2026-10-12). Independent of the Cal poll: the payment
  // happened even if the booking is slow, so show it as soon as Stripe has it.
  // A free (A$0) booking has no invoice and the box stays hidden.
  const invoiceBox = document.getElementById('invoice');
  async function loadInvoice(triesLeft) {
    try {
      const res = await fetch(`/api/invoice-link?session_id=${encodeURIComponent(sessionId)}`);
      const json = await res.json();
      if (json.invoice && json.invoice.url) {
        document.getElementById('invoice-link').href = json.invoice.url;
        if (json.invoice.number) document.getElementById('invoice-number').textContent = ` (invoice ${json.invoice.number})`;
        invoiceBox.hidden = false;
        return;
      }
    } catch { /* retried below */ }
    if (triesLeft > 1) setTimeout(() => loadInvoice(triesLeft - 1), 3000);
  }
  loadInvoice(4);

  let attempts = 0;
  let consecutiveErrors = 0;
  const maxAttempts = 15; // 15 × 2s = 30s

  async function poll() {
    attempts++;
    try {
      const res = await fetch(`/api/booking-status?session_id=${encodeURIComponent(sessionId)}`);
      const json = await res.json();
      consecutiveErrors = 0;
      if (json.refunded) {
        window.location.href = '/booking-failed';
        return;
      }
      if (json.confirmed) {
        header.textContent = 'Booking confirmed.';
        header.classList.remove('polling');
        subhead.textContent = '';
        confirmation.style.display = 'block';
        return;
      }
    } catch (err) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        header.textContent = 'Network error.';
        header.classList.remove('polling');
        subhead.innerHTML = 'Can\'t reach the booking server. Refresh the page; if it persists, email <a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a> with your receipt.';
        return;
      }
    }
    if (attempts >= maxAttempts) {
      header.textContent = 'Still processing.';
      header.classList.remove('polling');
      subhead.innerHTML = 'Booking is taking longer than expected. Email <a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a> with your receipt and I\'ll sort it manually.';
      return;
    }
    setTimeout(poll, 2000);
  }
  poll();
})();
