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

function renderHeroCard({ user, nextSession }) {
  const state = user.state;
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
      meta = `Install checklist done. Sam fires Pack #1a prompts with you in the session.`;
      cta = `<a href="/account/sessions" class="cta">View session details →</a>`;
      break;
    case 'between-s1-s2':
      label = 'Right now';
      title = `Play in your sandbox`;
      meta = `Pack #1a + prompts available. Next session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/packs" class="cta">Open Pack #1a →</a>`;
      break;
    case 'between-s2-s3':
      label = 'Right now';
      title = `Pack #1b unlocked — flower exercise`;
      meta = `Complete the EA build + flower exercise before next session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/packs" class="cta">Open Pack #1b →</a>`;
      break;
    case 'between-s3-s4':
      label = 'Right now';
      title = `Pack #2 unlocked`;
      meta = `Last session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/packs" class="cta">Open Pack #2 →</a>`;
      break;
    case 'post-s4-decision':
      label = 'You did it';
      title = `You've finished your Coaching Block.`;
      meta = `Want to continue? Retainer is A$650/mo — 2 sessions (90 min each) + async Slack. Most clients do 3-6 months.`;
      cta = `<a href="/account/subscription" class="cta">Discuss the Retainer →</a>`;
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
      cta = `<a href="/book/single-session" class="cta">Book a Single Session →</a>`;
      break;
    case 'cohort-active':
      label = 'Your cohort';
      title = `Group Block cohort active`;
      meta = `Next cohort session: ${getNextSessionLabel(nextSession)}.`;
      cta = `<a href="/account/sessions" class="cta">View cohort sessions →</a>`;
      break;
    default:
      label = 'Right now'; title = `State: ${state}`; meta = ''; cta = '';
  }
  return `
    <div class="hero-card">
      <div class="label">${label}</div>
      <div class="title">${title}</div>
      <div class="meta">${meta}</div>
      ${cta}
    </div>
  `;
}

module.exports = { renderHeroCard, getNextSessionLabel, fmtDate };
