// api/account/book.js — authenticated, prepaid session booking.
//
// The crux fix. A signed-in client with sessions left in a paid block books their next
// session here: it reuses the existing Cal slot cache (/api/cal/availability) and the
// existing no-charge Cal booking primitive (lib/cal.createBooking, already used by the
// free discovery path), gated on the client's session balance — and NEVER touches Stripe.
// GET renders the picker; POST books + decrements the balance.
//
// Identity comes from the session cookie, never the request body, so a client can only
// book against their own balance. The booking core (bookSession) is DI-friendly for tests.
'use strict';

const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const calLib = require('../../lib/cal');
const { calEventTypeIdFor } = require('../../lib/skus');
const { computeBalance, engagementBalance, minGapMsFor } = require('../../lib/sessionBalance');
const { nextBlockStage } = require('../../lib/autoAdvance');
const { fetchNextSession } = require('../../lib/calBookings');

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const MAX_BOOKING_WINDOW_MS = 60 * 86400000; // 60 days, mirrors api/checkout.js

// Which SKU's Cal event-type + availability a client's next booking uses.
function bookingSkuFor(balance) {
  if (balance.activeBlock) return balance.activeBlock.type;       // guided-setup, or a legacy coaching-block
  if (balance.isRetainer) return 'continuation-retainer';         // legacy state, retired SKU
  return null;
}

// A v5 engagement's session 2 sits at least a day after session 1 (the
// onboarding interview, the homework, lives in that gap). Session 1's slot is
// stamped on the engagement by the Stripe webhook; records without it
// (admin-created) are not gated. Returns the earliest allowed ms, or null when
// no gap applies.
function earliestAllowedMs(engagement) {
  if (!engagement) return null;
  const gap = minGapMsFor(engagement.type);
  if (!gap || !engagement.first_slot_iso) return null;
  const first = Date.parse(engagement.first_slot_iso);
  return Number.isNaN(first) ? null : first + gap;
}

// Which session (1-based) the client's next portal booking is. v5 SKUs have a
// different Cal event type (and length) per session, so the portal must book
// session N's type, not "the" type. Session 1 is always the checkout slot, so
// the next one is used + 1. The retainer has no counter: always 1.
function nextSessionNumber(balance) {
  if (!balance.activeBlock) return 1;
  return engagementBalance(balance.activeBlock).used + 1;
}

// Pure-ish booking core. Returns { ok, status, error?, booking? }. Mutates `user`
// (decrements the drawn-down engagement) and persists via kv on success.
async function bookSession({ kv, cal, skus, user, slotIso, now = Date.now() }) {
  const balance = computeBalance(user);
  const sku = bookingSkuFor(balance);
  if (!balance.bookable || !sku) return { ok: false, status: 403, error: 'no_sessions_remaining' };

  if (!slotIso || !ISO_RE.test(slotIso)) return { ok: false, status: 400, error: 'invalid_slot_iso' };
  const slotMs = Date.parse(slotIso);
  if (Number.isNaN(slotMs)) return { ok: false, status: 400, error: 'invalid_slot_iso' };
  if (slotMs < now) return { ok: false, status: 400, error: 'slot_in_past' };
  if (slotMs > now + MAX_BOOKING_WINDOW_MS) return { ok: false, status: 400, error: 'slot_too_far_in_future' };
  const earliest = earliestAllowedMs(balance.activeBlock);
  if (earliest !== null && slotMs < earliest) {
    return { ok: false, status: 400, error: 'too_soon', earliest_iso: new Date(earliest).toISOString() };
  }

  const sessionNumber = nextSessionNumber(balance);
  let eventTypeId;
  try { eventTypeId = skus.calEventTypeIdFor(sku, sessionNumber); } catch { return { ok: false, status: 500, error: 'sku_misconfigured' }; }

  // Dedupe a double-submit / refresh on the same slot. Synthetic id mirrors the
  // discovery path's convention so the same Cal-metadata backstop works.
  const synthId = `prepaid_${user.email}_${slotIso}`;
  try {
    const existing = await cal.findBookingByStripeSession(synthId);
    if (existing && existing.ok && existing.body && existing.body.data && existing.body.data.length > 0) {
      return { ok: false, status: 409, error: 'duplicate_booking' };
    }
  } catch (_) { /* dedupe is best-effort; proceed */ }

  const name = (user.name && String(user.name).trim()) || user.email.split('@')[0];
  const booking = await cal.createBooking({
    eventTypeId, slotIso, name, email: user.email, stripeSessionId: synthId, sku,
  });
  if (!booking || !booking.ok) {
    if (booking && booking.status === 409) return { ok: false, status: 409, error: 'slot_unavailable' };
    console.error('[account/book] createBooking failed', booking && booking.status, booking && booking.body);
    return { ok: false, status: 502, error: 'booking_failed' };
  }

  // Draw down the block balance (retainer has no fixed balance → nothing to decrement).
  if (balance.activeBlock) {
    const b = engagementBalance(balance.activeBlock);
    balance.activeBlock.sessions_total = b.total;
    balance.activeBlock.sessions_used = b.used + 1;
    // Self-driving stage: booking the Nth session implies the (N-1)th is done.
    const advanced = nextBlockStage(user.state, balance.activeBlock.sessions_used);
    if (advanced) { user.state = advanced; user.state_updated_at = new Date(now).toISOString(); }
    await kv.setUser(user.email, user);
  }
  return { ok: true, status: 200, booking, sku, session: sessionNumber };
}

// ---- HTTP handler (GET = picker page, POST = book) ----

function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.body === 'string') raw = req.body;
  else return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function renderBookPage({ balance, sku, nextSession }) {
  if (!balance.bookable || !sku) {
    const msg = balance.hasBlock
      ? `You've used all the sessions you paid for. After your 30 days of Slack support you're on your own by design; if you want Sam back, it's A$233 an hour: <a href="mailto:cradsdavis@gmail.com">email Sam</a>.`
      : `You don't have a session to book right now. <a href="/offer">See setup and support</a> or <a href="mailto:cradsdavis@gmail.com">email Sam</a>.`;
    return `
      <h1 class="serif">Book a session</h1>
      <section class="panel"><div class="panel-content">${msg}</div></section>`;
  }

  const v5Type = balance.activeBlock && (balance.activeBlock.type === 'guided-setup' || balance.activeBlock.type === 'walkthrough') ? balance.activeBlock.type : null;
  const sessionNumber = nextSessionNumber(balance);
  const earliest = earliestAllowedMs(balance.activeBlock);
  const v5Length = v5Type === 'walkthrough' ? '30 minutes' : 'two hours';
  const balanceLine = balance.isRetainer
    ? `Retainer active: book your next session below.`
    : v5Type
      ? `Your second ${v5Type === 'walkthrough' ? 'walkthrough' : 'guided setup'} session (${v5Length}). Pick a time at least a day after your first one${earliest ? ` (from ${escapeHtml(new Date(earliest).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' }))})` : ''}, so the interview between them has room.`
      : `You have <strong>${balance.remaining}</strong> session${balance.remaining === 1 ? '' : 's'} left in your block (${balance.used} of ${balance.total} used).`;
  const nextLine = nextSession
    ? `<p class="subtitle">Next booked: ${escapeHtml(new Date(nextSession.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' }))}.</p>`
    : '';

  // Inlined picker (no name/email fields — identity comes from the session). Posts the
  // chosen slot to this same route; on success bounces to Sessions with a confirmation.
  return `
    <h1 class="serif">Book a session</h1>
    <section class="panel">
      <div class="panel-content">${balanceLine}</div>
      ${nextLine}
    </section>
    <div id="slot-picker" class="slot-picker"><div class="slot-loading">Loading available times…</div></div>
    <script>
    (function () {
      'use strict';
      var SKU = ${JSON.stringify(sku)};
      var SESSION = ${JSON.stringify(sessionNumber)};
      var root = document.getElementById('slot-picker');
      function fmtDay(iso){var d=new Date(iso);return d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});}
      function fmtTime(iso){var d=new Date(iso);return d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});}
      function norm(raw){
        if(Array.isArray(raw))return raw.map(function(s){return typeof s==='string'?{time:s}:s;});
        if(!raw||typeof raw!=='object')return [];
        var src = (raw.slots&&typeof raw.slots==='object')?raw.slots:raw;
        var out=[];Object.keys(src).forEach(function(date){var arr=src[date];if(!Array.isArray(arr))return;arr.forEach(function(s){var t=typeof s==='string'?s:s.time;if(typeof t==='string'&&t.length>=16&&t.charAt(4)==='-'&&t.charAt(10)==='T')out.push({time:t});});});
        return out;
      }
      function load(){
        var now=new Date();var start=now.toISOString();var end=new Date(now.getTime()+21*86400000).toISOString();
        fetch('/api/cal/availability?sku='+encodeURIComponent(SKU)+'&session='+encodeURIComponent(SESSION)+'&startDate='+encodeURIComponent(start)+'&endDate='+encodeURIComponent(end))
          .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
          .then(function(d){render(norm(d.slots!==undefined?d.slots:d));})
          .catch(function(e){root.innerHTML='<div class="slot-error">Could not load times: '+e.message+'. Refresh, or email cradsdavis@gmail.com.</div>';});
      }
      function render(slots){
        if(!slots.length){root.innerHTML='<div class="slot-error">No availability in the next 3 weeks. Email cradsdavis@gmail.com and Sam will sort a time.</div>';return;}
        var byDay={};slots.forEach(function(s){var k=s.time.slice(0,10);(byDay[k]=byDay[k]||[]).push(s.time);});
        var html='';Object.keys(byDay).sort().forEach(function(day){
          html+='<div class="slot-day"><div class="slot-day-label">'+fmtDay(day+'T12:00:00')+'</div><div class="slot-grid">';
          byDay[day].forEach(function(iso){html+='<button class="slot-button" data-iso="'+iso+'" aria-pressed="false">'+fmtTime(iso)+'</button>';});
          html+='</div></div>';
        });
        html+='<form id="slot-form" class="slot-form" style="display:none;"><p><strong>Selected:</strong> <span id="sel"></span></p><button class="book-cta" type="submit" id="sb">Book this session →</button><p id="er" class="slot-error" style="display:none;margin-top:1rem;"></p></form>';
        root.innerHTML=html;wire();
      }
      function wire(){
        var form=document.getElementById('slot-form');var sel=document.getElementById('sel');var iso=null;
        Array.prototype.forEach.call(document.querySelectorAll('.slot-button'),function(btn){
          btn.addEventListener('click',function(e){e.preventDefault();Array.prototype.forEach.call(document.querySelectorAll('.slot-button'),function(b){b.classList.remove('selected');b.setAttribute('aria-pressed','false');});btn.classList.add('selected');btn.setAttribute('aria-pressed','true');iso=btn.dataset.iso;sel.textContent=fmtDay(iso)+' at '+fmtTime(iso);form.style.display='block';form.scrollIntoView({behavior:'smooth',block:'nearest'});});
        });
        form.addEventListener('submit',function(e){
          e.preventDefault();if(!iso)return;var er=document.getElementById('er');er.style.display='none';
          var sb=document.getElementById('sb');sb.disabled=true;sb.textContent='Booking…';
          fetch('/api/account/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slot_iso:iso})})
            .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
            .then(function(res){if(!res.ok)throw new Error(res.j.error==='too_soon'?'that is too close to your first session; pick a slot at least a day later':(res.j.message||res.j.error||'failed'));window.location.href='/account/sessions?booked=1';})
            .catch(function(err){er.textContent='Could not book: '+err.message+'. Pick another time or email cradsdavis@gmail.com.';er.style.display='block';sb.disabled=false;sb.textContent='Book this session →';});
        });
      }
      load();
    })();
    </script>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async function handler(req, res) {
  const kv = defaultKv();
  const user = await requireAuth({ kv, req, res });
  if (!user) return;

  if (req.method === 'POST') {
    const body = parseJsonBody(req);
    const result = await bookSession({ kv, cal: calLib, skus: { calEventTypeIdFor }, user, slotIso: String(body.slot_iso || '') });
    return res.status(result.status).json(result.ok ? { booked: true } : { error: result.error, earliest_iso: result.earliest_iso });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  // Onboarding-incomplete clients book their first session in the onboarding stepper.
  if (user.state === 'onboarding-incomplete') return res.redirect(302, '/account/onboarding');

  const balance = computeBalance(user);
  const sku = bookingSkuFor(balance);
  const nextSession = await fetchNextSession(user.email).catch(() => null);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Book a session', activeRoute: 'book', isAdmin: isAdmin(user.email),
    mainContent: renderBookPage({ balance, sku, nextSession }),
  }));
};

// Exported for tests.
module.exports.bookSession = bookSession;
module.exports.bookingSkuFor = bookingSkuFor;
module.exports.earliestAllowedMs = earliestAllowedMs;
module.exports.nextSessionNumber = nextSessionNumber;
