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

// The two v5 engagements (walkthrough, guided setup) share one journey: two
// sessions, the interview between, 30 days of Slack support, then on your own
// by design. Extra time after that is A$233 an hour on request, not a product.
const V5_TYPES = new Set(['walkthrough', 'guided-setup']);
const V5_LABEL = { 'walkthrough': 'Walkthrough', 'guided-setup': 'Guided setup' };
const V5_S2 = { 'walkthrough': '30 minutes', 'guided-setup': 'two hours' };
const AFTER_LINE = `After your 30 days of Slack support you're on your own by design. If you want Sam back, it's A$233 an hour.`;

function renderV5Hero({ user, nextSession, balance, type }) {
  const b = balance || {};
  const first = b.activeBlock && b.activeBlock.first_slot_iso;
  if (user.state === 'onboarding-incomplete') return null;
  if (b.remaining > 0) {
    const firstLine = first ? `Your first session is ${fmtDate(first)}.` : (nextSession ? `Your first session is ${fmtDate(nextSession.date)}.` : `Your first session is booked.`);
    return `
    <div class="hero-card">
      <div class="label">${V5_LABEL[type]}</div>
      <div class="title">Session 1 of 2</div>
      <div class="meta">${firstLine} Book session 2 (${V5_S2[type]}) for at least a day later; the interview between them is where it takes.</div>
      <a href="/account/book" class="cta">Book session 2 →</a>
      <a href="/account/sessions" class="cta">View session details →</a>
    </div>
  `;
  }
  return `
    <div class="hero-card">
      <div class="label">${V5_LABEL[type]}</div>
      <div class="title">Both sessions booked</div>
      <div class="meta">${nextSession ? `Next: ${getNextSessionLabel(nextSession)}.` : 'Your sessions are done.'} ${AFTER_LINE}</div>
      <a href="/account/sessions" class="cta">View sessions →</a>
      <a href="mailto:cradsdavis@gmail.com" class="cta">Email Sam →</a>
    </div>
  `;
}

function renderHeroCard({ user, nextSession, balance }) {
  const state = user.state;
  const engagements = user.engagements || [];
  const v5 = engagements.find((e) => V5_TYPES.has(e.type) && !e.completed) || engagements.find((e) => V5_TYPES.has(e.type));
  const onBlock = engagements.some((e) => e.type === 'coaching-block' || e.type === 'coaching-block-pay4');
  if (v5 && !onBlock) {
    const g = renderV5Hero({ user, nextSession, type: v5.type, balance: balance || { activeBlock: engagements.find((e) => e.type === v5.type && !e.completed), remaining: 1 } });
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
      meta = `Want more time? It's A$233 an hour, on request.`;
      cta = `<a href="mailto:cradsdavis@gmail.com" class="cta">Email Sam →</a>`;
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
      meta = `Want to come back for something new? It's A$233 an hour, on request.`;
      cta = `<a href="mailto:cradsdavis@gmail.com" class="cta">Email Sam →</a>`;
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
