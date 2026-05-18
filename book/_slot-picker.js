// book/_slot-picker.js — vanilla JS slot picker for /book/<sku> pages
// Window globals expected: SKU_SLUG (string), IS_PAID (boolean)
(function () {
  'use strict';
  const root = document.getElementById('slot-picker');
  const sku = window.SKU_SLUG;
  const isPaid = window.IS_PAID;

  function fmtDay(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  async function loadSlots() {
    root.innerHTML = '<div class="slot-loading">Loading available slots…</div>';
    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 21 * 86400000).toISOString();
    const url = `/api/cal/availability?sku=${encodeURIComponent(sku)}&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderSlots(data.slots);
    } catch (err) {
      root.innerHTML = `<div class="slot-error">Couldn't load slots: ${err.message}. Refresh or email cradsdavis@gmail.com.</div>`;
    }
  }

  // /api/cal/availability returns { date: [slots] } flat (unwrapped from Cal v2).
  // Handle that, plus legacy array + { data: ... } shapes defensively.
  function normaliseSlots(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== 'object') return [];
    const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
    const keys = Object.keys(raw);
    if (keys.length && dateKeyPattern.test(keys[0])) {
      const out = [];
      for (const [date, slots] of Object.entries(raw)) {
        if (!Array.isArray(slots)) continue;
        for (const s of slots) {
          const time = typeof s === 'string' ? s : s.time;
          if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(time)) continue;
          out.push({ time, date });
        }
      }
      return out;
    }
    if (raw.data) {
      const out = [];
      for (const [date, slots] of Object.entries(raw.data)) {
        if (!Array.isArray(slots)) continue;
        for (const s of slots) {
          const time = typeof s === 'string' ? s : s.time;
          if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(time)) continue;
          out.push({ time, date });
        }
      }
      return out;
    }
    return [];
  }

  function renderSlots(raw) {
    const slots = normaliseSlots(raw);
    if (slots.length === 0) {
      root.innerHTML = '<div class="slot-error">No availability in the next 3 weeks. Email cradsdavis@gmail.com to arrange.</div>';
      return;
    }
    const byDay = {};
    for (const s of slots) {
      const iso = s.time;
      const dayKey = iso.slice(0, 10);
      (byDay[dayKey] = byDay[dayKey] || []).push(iso);
    }
    const dayKeys = Object.keys(byDay).sort();
    let html = '';
    for (const day of dayKeys) {
      html += `<div class="slot-day">`;
      html += `<div class="slot-day-label">${fmtDay(day + 'T12:00:00')}</div>`;
      html += `<div class="slot-grid">`;
      for (const iso of byDay[day]) {
        html += `<button class="slot-button" data-iso="${iso}" aria-pressed="false">${fmtTime(iso)}</button>`;
      }
      html += `</div></div>`;
    }
    html += renderForm();
    root.innerHTML = html;
    wireUp();
  }

  function renderForm() {
    return `
      <form id="slot-form" class="slot-form" style="display:none;">
        <p><strong>Selected:</strong> <span id="selected-label"></span></p>
        <div class="field"><label for="bk-name">Your name</label><input id="bk-name" type="text" name="name" autocomplete="name" required></div>
        <div class="field"><label for="bk-email">Email</label><input id="bk-email" type="email" name="email" autocomplete="email" required></div>
        <input type="hidden" name="slot_iso" id="slot-iso">
        <button class="book-cta" type="submit" id="submit-btn">
          ${isPaid ? 'Book + Pay →' : 'Book →'}
        </button>
        <p id="submit-error" class="slot-error" style="display:none; margin-top:1rem;"></p>
      </form>`;
  }

  function wireUp() {
    const form = document.getElementById('slot-form');
    const slotInput = document.getElementById('slot-iso');
    const selectedLabel = document.getElementById('selected-label');
    document.querySelectorAll('.slot-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.slot-button').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        const iso = btn.dataset.iso;
        slotInput.value = iso;
        selectedLabel.textContent = `${fmtDay(iso)} at ${fmtTime(iso)}`;
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    form.addEventListener('submit', onSubmit);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const errBox = document.getElementById('submit-error');
    errBox.style.display = 'none';
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
    const fd = new FormData(e.target);
    const payload = {
      sku,
      slot_iso: fd.get('slot_iso'),
      name: fd.get('name'),
      email: fd.get('email'),
    };
    try {
      if (!isPaid) {
        const res = await fetch('/api/checkout?free=1', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        window.location.href = '/thanks?type=discovery';
        return;
      }
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      window.location.href = json.checkout_url;
    } catch (err) {
      errBox.textContent = `Couldn't proceed: ${err.message}. Try a different slot or email cradsdavis@gmail.com.`;
      errBox.style.display = 'block';
      submitBtn.disabled = false; submitBtn.textContent = isPaid ? 'Book + Pay →' : 'Book →';
    }
  }

  loadSlots();
})();
