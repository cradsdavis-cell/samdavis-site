'use strict';
// /access — the far end of an invitation link.
//
// Sam's ruling, 2026-08-11: "the link should be sent to an email address, so
// multiple accounts can have access to a single mineral", and on whether a
// human should approve it: "No as long as they have the link and the account
// matches. Maybe there is a gated login or something for these links?"
//
// This is that gate. The link carries WHICH mineral, and nothing else that
// matters: no token to leak, no secret to expire, no code to read to anybody.
// Holding it proves nothing. The address you are signed in as decides
// everything, which is why a forwarded link is worthless to the person who
// receives it and harmless to the person who sent it.
//
// Two outcomes, and they are deliberately different:
//   - you already reach this mineral (you hold it, or a grant of yours is live):
//     it says so, and points at the app, because access is not the thing you are
//     missing, a machine is.
//   - a grant is WAITING for your address: signing in here is the proof it was
//     waiting for. It records that proof and the mineral turns the intent into
//     access the next time it drains, which is on boot and after every change.
//
// It never grants anything itself. It says "this person holds this mailbox"; the
// mineral still checks it invited them. A proof against a community that never
// asked for you is inert, so this page is safe to point ANY signed-in person at.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');
const { directoryFor } = require('../../lib/directory');
const { mintAppToken } = require('../../lib/appAuth');

const DIRECTORY = process.env.CRADS_DIRECTORY_URL || 'https://directory.crads-ai.com';
const ORG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;                     // requireAuth sends them to sign in, then back here

  const org = String((req.query && req.query.org) || '').trim().toLowerCase();
  if (!ORG_RE.test(org)) {
    return res.status(400).send(renderAppShell({
      email: user.email, active: 'minerals', title: 'That link is not right',
      main: `<h1>That link is not right</h1><p class="lead">It does not name a community, so there is nothing to accept. Ask whoever sent it for a fresh one.</p>`,
    }));
  }

  const dir = directoryFor(user);
  // Do you ALREADY reach it? Asked first, because telling somebody their
  // invitation is pending when they have had access for a month is the kind of
  // wrong that makes people distrust the whole thing.
  let already = false;
  try {
    const r = typeof dir.minerals === 'function' ? await dir.minerals() : { ok: false };
    already = !!(r.ok && (r.minerals || []).some((m) => String(m.org || '').toLowerCase() === org));
  } catch { /* the directory being unreachable is not a reason to refuse the proof below */ }

  let accepted = false;
  let problem = '';
  if (!already) {
    try {
      // The same RS256 app token every directory read uses, minted here rather
      // than borrowed from the reader: the worker takes the address FROM this
      // token and ignores anything in the body, which is precisely what makes a
      // forwarded link useless to whoever receives it.
      const token = mintAppToken({ email: String(user.email || '').toLowerCase(), stateVersion: user.state_version || 1, accountId: user.id });
      const r = await fetch(`${DIRECTORY}/grant-proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ org }),
      });
      if (r.ok) accepted = true;
      else if (r.status === 404) problem = 'That community does not exist any more.';
      else if (r.status === 401) problem = 'Your sign-in could not be verified. Sign out and back in, then click the link again.';
      else problem = `The directory answered ${r.status}.`;
    } catch (e) {
      problem = 'The directory could not be reached. Nothing is lost; try the link again in a minute.';
    }
  }

  const who = escapeHtml(user.email || '');
  const community = escapeHtml(org);
  const body = already
    ? `<h1>You already have access</h1>
       <p class="lead">You are signed in as <b>${who}</b>, and <b>${community}</b> is already yours to open.
       What you need next is this computer on the roster, and that happens in the app.</p>
       <p><a class="btn" href="/app/minerals">See your minerals</a></p>
       <p class="hint">Open the Crads-AI app on the machine you want to use and sign in as ${who}. It makes a key here, keeps the private half, and the mineral takes it from there.</p>`
    : accepted
      ? `<h1>Accepted</h1>
         <p class="lead">You are signed in as <b>${who}</b>, and that is the address <b>${community}</b> invited.
         Your access opens as soon as the mineral picks this up, usually within a minute or two.</p>
         <p><a class="btn" href="/app/minerals">See your minerals</a></p>
         <p class="hint">If it is not listed shortly, the mineral may be asleep; it collects invitations when it wakes. Nothing is lost in the meantime.</p>`
      : `<h1>We could not finish that</h1>
         <p class="lead">${escapeHtml(problem || 'Something went wrong accepting the invitation.')}</p>
         <p class="hint">You are signed in as ${who}. If the invitation was sent to a different address, sign out and sign in as that one, then click the link again.</p>`;

  return res.status(200).send(renderAppShell({ email: user.email, active: 'minerals', title: 'Invitation', main: body }));
};
