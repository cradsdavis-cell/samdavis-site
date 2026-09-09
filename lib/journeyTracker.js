'use strict';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
}

function getNextSessionLabel(nextSession) {
  if (!nextSession) return '';
  return `${nextSession.label || 'next session'} on ${fmtDate(nextSession.date)}`;
}

const BOOKING_STATES = new Set(['pre-s1', 'between-s1-s2', 'between-s2-s3', 'between-s3-s4']);

// A guided-setup client (v4) is on the same journey ladder as a block client
// but the copy is about the setup, not packs: two sessions, homework between.
function renderGuidedHero({ user, nextSession, balance }) {
  const b = balance || {};
  const first = b.activeBlock && b.activeBlock.first_slot_iso;
  if (user.state === 'onboarding-incomplete') return null;
  if (b.remaining > 0) {
    const firstLine = first ? `Your first session is ${fmtDate(first)}.` : (nextSession ? `Your first session is ${fmtDate(nextSession.date)}.` : `Your first session is booked.`);
    return `
    <div class="hero-card">
      <div class="label">Guided setup</div>
      <div class="title">Session 1 of 2</div>
      <div class="meta">${firstLine} Book session 2 for at least a day later; the homework between them is where the setup takes.</div>
      <a href="/account/book" class="cta">Book session 2 →</a>
      <a href="/account/sessions" class="cta">View session details →</a>
    </div>
  `;
  }
  return `
    <div class="hero-card">
      <div class="label">Guided setup</div>
      <div class="title">Both sessions booked</div>
      <div class="meta">${nextSession ? `Next: ${getNextSessionLabel(nextSession)}.` : 'Your setup is done.'} After that, hourly support is on request and a working session is 90 minutes on one question.</div>
      <a href="/account/sessions" class="cta">View sessions →</a>
      <a href="/book/working-session" class="cta">Book a working session →</a>
    </div>
  `;
}

function renderHeroCard({ user, nextSession, balance }) {
  const state = user.state;
  const guided = (user.engagements || []).some((e) => e.type === 'guided-setup') && !(user.engagements || []).some((e) => e.type === 'coaching-block' || e.type === 'coaching-block-pay4');
  if (guided) {
    const g = renderGuidedHero({ user, nextSession, balance: balance || { activeBlock: (user.engagements || []).find((e) => e.type === 'guided-setup' && !e.completed), remaining: 1 } });
    if (g) return g;
  }
  let label, title, meta, cta;
  switch (state) {
    case 'onboarding-incomplete':
      label = 'Right now'; title = 'Finish setting up your account';
      meta = `You're on step ${(user.onboarding && user.onboarding.step) || 1} of 4.`;
      cta = `<a href="/account/onboarding" class="cta">Continue onboarding →</a>`;
      break;
    case 'pre-s1':
      label = 'Right now';
      title = `Your first session is ${fmtDate(nextSession && nextSession.date)}`;
      meta = `Install checklist done. Sam fires the Pack 1 starter prompts with you in the session.`;
      cta = `<a href="/account/sessions" class="cta">View session details →</a>`;
      break;
    case 'between-s1-s2':
      label = 'Right now';
      title = `Play in your sandbox`;
      meta = `Pack 1 — Starter Prompts available. Next session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/packs" class="cta">Open Pack 1 →</a>`;
      break;
    case 'between-s2-s3':
      label = 'Right now';
      title = `Pack 2 unlocked — Make it you`;
      meta = `Complete the EA build + self-mapping (flower) exercise before next session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/packs" class="cta">Open Pack 2 →</a>`;
      break;
    case 'between-s3-s4':
      label = 'Right now';
      title = `Pack 3 unlocked — Connect it`;
      meta = `Last session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/packs" class="cta">Open Pack 3 →</a>`;
      break;
    case 'post-s4-decision':
      label = 'You did it';
      title = `You've finished your Coaching Block.`;
      meta = `Want more time? A working session is 90 minutes on one question, recorded, notes after. Hourly support is on request.`;
      cta = `<a href="/book/working-session" class="cta">Book a working session →</a>`;
      break;
    case 'retainer-active':
      label = 'Retainer active';
      title = `Two sessions a month`;
      meta = `Next session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/sessions" class="cta">View sessions →</a>`;
      break;
    case 'graduated':
      label = 'Alumni';
      title = `You have lifetime access to your packs.`;
      meta = `Want to come back for a focused 90 min on something new?`;
      cta = `<a href="/book/working-session" class="cta">Book a working session →</a>`;
      break;
    default:
      label = 'Right now'; title = `State: ${state}`; meta = ''; cta = '';
  }

  // Prepaid booking CTA — the thing clients couldn't find. Surfaced whenever they have a
  // session to book (block remaining > 0, or an active retainer), so booking isn't buried.
  let bookCta = '';
  if (balance) {
    if (balance.hasBlock && BOOKING_STATES.has(state) && balance.remaining > 0) {
      meta += ` <em>· ${balance.used} of ${balance.total} sessions used, ${balance.remaining} left to book.</em>`;
      bookCta = `<a href="/account/book" class="cta">Book your next session →</a>`;
    } else if (balance.hasBlock && BOOKING_STATES.has(state) && balance.remaining === 0) {
      meta += ` <em>· all ${balance.total} sessions booked.</em>`;
    } else if (balance.isRetainer) {
      bookCta = `<a href="/account/book" class="cta">Book a session →</a>`;
    }
  }

  return `
    <div class="hero-card">
      <div class="label">${label}</div>
      <div class="title">${title}</div>
      <div class="meta">${meta}</div>
      ${bookCta}
      ${cta}
    </div>
  `;
}

module.exports = { renderHeroCard, getNextSessionLabel, fmtDate };
