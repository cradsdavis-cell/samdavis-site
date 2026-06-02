// lib/leadCapture.browser.js — client-side opt-in form handler.
// Per coaching co-primary spec § 5.2.
//
// Loaded as <script defer src="/lib/leadCapture.browser.js"></script>.
// Auto-initialises on DOMContentLoaded — finds every <form data-lead-capture>
// and wires submission to POST /api/lead-capture.
//
// States: idle → submitting → done | error
// On success the form is replaced by an inline confirmation.
(function () {
  'use strict';

  function setStatus(form, message, kind) {
    const slot = form.querySelector('.status');
    if (!slot) return;
    slot.hidden = !message;
    slot.textContent = message || '';
    slot.dataset.kind = kind || '';
  }

  async function handleSubmit(form, ev) {
    ev.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const emailInput = form.querySelector('input[name="email"]');
    if (!emailInput) return;

    const email = (emailInput.value || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(form, "That email doesn't look right — try again?", 'error');
      return;
    }

    const source = form.dataset.source || 'unknown';

    if (button) { button.disabled = true; button.dataset.originalLabel = button.textContent; button.textContent = 'Sending…'; }
    setStatus(form, '', '');

    try {
      const resp = await fetch('/api/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || ('http_' + resp.status));
      }
      // Replace the form with a confirmation
      const card = form.closest('.lead-capture-card') || form.parentNode;
      const confirmation = document.createElement('div');
      confirmation.className = 'lead-capture-done';
      confirmation.innerHTML = '<h3>Check your inbox.</h3><p>First email is on the way. If it doesn\'t arrive in a few minutes, check spam — or reply to this thread and let me know.</p>';
      form.replaceWith(confirmation);
    } catch (err) {
      if (button) { button.disabled = false; if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel; }
      setStatus(form, "Something went wrong sending that. Try again, or email cradsdavis@gmail.com.", 'error');
      // eslint-disable-next-line no-console
      console.error('[lead-capture]', err);
    }
  }

  function init() {
    const forms = document.querySelectorAll('form[data-lead-capture]');
    forms.forEach((form) => {
      if (form.dataset.bound) return;
      form.dataset.bound = '1';
      form.addEventListener('submit', (ev) => handleSubmit(form, ev));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
