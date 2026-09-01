'use strict';
// lib/mineralView.js — the words four pages have to agree on (2026-08-13).
//
// Minerals, Access, Activity and Admin all render the same three facts: how
// fresh a mirror is, whose an email hash is, and what an event means in plain
// words. Before this they each did it their own way, which is how /app/minerals
// and /app/admin ended up disagreeing about whether a destroyed pebble existed
// (finding 76). One source, four readers.
//
// Sam's ruling that governs this file (2026-08-13): "persistent = never lies,
// not never forgets". So nothing here softens a gap. If the page cannot know
// something it says so, and if a machine has stopped talking it says that
// rather than showing its last known state as though it were current.

const { escapeHtml } = require('./appShell');

// ---- freshness ------------------------------------------------------------
//
// THE MIRROR IS A HEARTBEAT, NOT A CHANGE STAMP. enrol-sync calls
// /mineral-register unconditionally every two minutes on every box (ai-os
// scheduler.mjs, odd minutes, rocks included) and that write re-stamps
// `updated`. So a stale timestamp does not mean "nothing happened here", it
// means the machine stopped reporting, and that is a fact worth shouting.
//
// The bands are deliberately asymmetric. Under an hour is silence, because a
// page that nags about a ten-minute-old reading trains people to ignore it.
// Past a day is a warning. Past a week the page stops presenting what it holds
// as current at all.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function freshness(updated, now = Date.now()) {
  const at = Number(updated) || 0;
  if (!at) return { level: 'unknown', words: 'this mineral has never reported in' };
  const age = Math.max(0, now - at);
  if (age < HOUR) return { level: 'fresh', words: '' };
  if (age < DAY) {
    const h = Math.max(1, Math.round(age / HOUR));
    return { level: 'recent', words: `last reported ${h} hour${h === 1 ? '' : 's'} ago` };
  }
  const d = Math.max(1, Math.round(age / DAY));
  if (age < 7 * DAY) return { level: 'stale', words: `last reported ${d} day${d === 1 ? '' : 's'} ago` };
  return { level: 'dark', words: `dark for ${d} days` };
}

/**
 * The chip a card wears. Fresh minerals get nothing: a badge that is always
 * there is furniture, and furniture is not information.
 */
function freshnessChip(updated, now = Date.now()) {
  const f = freshness(updated, now);
  if (f.level === 'fresh') return '';
  const cls = f.level === 'dark' ? 'bad' : f.level === 'stale' ? 'warn' : '';
  return `<span class="chip ${cls}">${escapeHtml(f.words)}</span>`;
}

/**
 * The sentence a page puts above stale content, so nothing below it is read as
 * current. Empty when there is nothing to warn about.
 */
function stalenessNote(updated, now = Date.now()) {
  const f = freshness(updated, now);
  if (f.level === 'fresh' || f.level === 'recent') return '';
  if (f.level === 'unknown') {
    return 'This mineral has never reported to the directory, so everything below is what was expected of it rather than what it has confirmed.';
  }
  return `This machine has not reported in for ${f.words.replace(/^(last reported|dark for) /, '')}. What follows is the last thing it said, not what is true right now.`;
}

// ---- identity -------------------------------------------------------------
//
// The directory stores every account as sha256(lowercased email) and never an
// address, which is right for a mirror. The addresses live on this site, in its
// own KV, so resolving a hash is a LOOKUP against a known candidate set, not a
// crack. Anything that does not resolve is named as unresolved rather than
// dressed up: "an account not on this site" is a fact, a truncated hash printed
// as though it were a person is not (QA finding 56).
const { createHash } = require('node:crypto');

const hashEmail = (email) => createHash('sha256').update(String(email || '').toLowerCase()).digest('hex');

function holderIndex(users = []) {
  const byHash = new Map();
  for (const u of users) {
    const e = String(u && u.email || '').toLowerCase();
    if (!e) continue;
    byHash.set(hashEmail(e), { email: u.email, id: u.id || '' });
    if (u.id) byHash.set(String(u.id), { email: u.email, id: u.id });
  }
  return byHash;
}

/**
 * Name a grant's subject. `you` is checked first and by identity rather than by
 * string, because a page that lists the reader among the strangers reads as a
 * page that does not know who is looking at it.
 */
function nameGrantee(grant, byHash, me = {}) {
  const g = grant || {};
  const isMe = (g.account_id && me.id && g.account_id === me.id)
    || (g.e && me.hash && g.e === me.hash);
  if (isMe) return { label: 'you', resolved: true, isMe: true };
  const hit = (g.account_id && byHash.get(String(g.account_id))) || (g.e && byHash.get(String(g.e)));
  if (hit) return { label: hit.email, resolved: true, isMe: false };
  return { label: 'an account not on this site', resolved: false, isMe: false };
}

// ---- events ---------------------------------------------------------------
//
// The event log speaks in wire vocabulary (member-join, rock-tie-rejected,
// org-membership-drop). A person reading their own history should not have to
// learn it. Anything unmapped falls through to its raw type rather than being
// dropped: an event nobody wrote words for is still something that happened,
// and hiding it would be the page lying by omission.
function eventWords(evt = {}) {
  const org = evt.org_display || evt.org || '';
  const slug = evt.slug || '';
  const who = org || slug || 'a mineral';
  switch (evt.type) {
    case 'member-join':
      return evt.status === 'pending'
        ? `Asked to ${evt.rel === 'anchored' ? 'anchor to' : 'join'} ${who}`
        : `${evt.rel === 'anchored' ? 'Anchored to' : 'Joined'} ${who}`;
    case 'member-left': return `Left ${who}`;
    case 'member-change': return `Membership of ${who} changed`;
    case 'grant-proof': return `Accepted an invitation to ${who}`;
    case 'org-register': return `${who} was registered`;
    case 'box-built': return `A mineral was built${slug ? ` (${slug})` : ''}`;
    case 'box-torn-down': return `${slug || 'A mineral'} was torn down`;
    case 'promote-requested': return `Asked to promote ${slug || who}`;
    case 'promote-approved': return `${slug || who} was promoted`;
    case 'promote-rejected': return `Promotion of ${slug || who} was refused`;
    case 'rock-tie-rejected': return `${who} declined the tie`;
    case 'community-listed': return `${who} was listed publicly`;
    case 'community-unlisted': return `${who} was delisted`;
    case 'community-catalog-published': return `${who} published a catalogue${typeof evt.items === 'number' ? ` of ${evt.items}` : ''}`;
    case 'rock-brain-published': return `${who} published its brain${typeof evt.pages === 'number' ? ` (${evt.pages} pages)` : ''}`;
    case 'rock-brain-share': return `${who} turned brain sharing ${evt.on ? 'on' : 'off'}`;
    case 'org-membership': return `${evt.pebble || 'a pebble'} joined ${evt.rock || 'a rock'}`;
    case 'org-membership-drop': return `${evt.pebble || 'a pebble'} left ${evt.rock || 'a rock'}`;
    default: return String(evt.type || 'something happened').replace(/-/g, ' ');
  }
}

module.exports = {
  freshness, freshnessChip, stalenessNote,
  holderIndex, nameGrantee, hashEmail,
  eventWords,
};
