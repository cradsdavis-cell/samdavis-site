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

  // "Who else could do this with you?" (2026-10-21): after a guided setup
  // only, once the booking is confirmed. The answer goes to Sam by email.
  const whoElse = document.getElementById('who-else');
  function showWhoElse() {
    if (params.get('sku') !== 'guided-setup' || !whoElse) return;
    whoElse.hidden = false;
    const form = document.getElementById('who-else-form');
    const errBox = document.getElementById('we-error');
    const btn = document.getElementById('we-submit');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      btn.disabled = true; btn.textContent = 'Sending…';
      const fd = new FormData(form);
      try {
        const res = await fetch('/api/who-else', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, name: fd.get('name'), email: fd.get('email') }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        form.hidden = true;
        document.getElementById('we-done').hidden = false;
      } catch (err) {
        errBox.textContent = err.message === 'invalid_email'
          ? "That email doesn't look right. Check it, or leave it blank."
          : 'That didn\'t send. Email their name to cradsdavis@gmail.com instead.';
        errBox.hidden = false;
        btn.disabled = false; btn.textContent = 'Send to Sam';
      }
    });
  }

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
        showWhoElse();
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
