'use strict';
// The far end of an invitation link. Lifted OUT of api/app/access.js on
// 2026-08-13 when that route grew a second surface (the access matrix), and
// behaviourally unchanged: every invitation ever sent points at
// /access?org=<handle>, those links sit in inboxes for 30 days, and a rename to
// tidy a file would have broken live ones. access.js branches on the query and
// calls this.
//
// It lives in lib/ rather than api/app/ because it is NOT a route. Everything
// under api/app is a handler and tests/appShell.test.js enforces that every one
// of them calls requireAuth; a helper sitting there looked like an ungated page
// to that check, and the check was right to complain. Authentication happens in
// access.js before this is ever called, and the `user` it receives is the proof.
//
// Sam's ruling, 2026-08-11: "the link should be sent to an email address, so
// multiple accounts can have access to a single mineral", and on whether a human
// should approve it: "No as long as they have the link and the account matches."
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
const { renderAppShell, escapeHtml } = require('./appShell');
const { directoryFor } = require('./directory');
const { mintAppToken } = require('./appAuth');

const DIRECTORY = process.env.CRADS_DIRECTORY_URL || 'https://directory.crads-ai.com';
const ORG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

module.exports = async function renderInvitation(req, res, user, org) {
  if (!ORG_RE.test(org)) {
    return res.status(400).send(renderAppShell({
      email: user.email, active: 'access', title: 'That link is not right',
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
    // Match on the registered HANDLE (the worker resolves it), with the host
    // label as a fallback for rows written before it rode the mirror. Matching
    // on m.org alone was the original bug — /my-minerals carried no org field
    // at all, so this could never be true — and matching on the host label
    // alone replaced it with a subtler one, because the two legitimately differ.
    already = !!(r.ok && (r.minerals || []).some((m) => {
      const handle = String(m.org || '').toLowerCase();
      const hostLabel = String(m.host || '').split('.')[0].toLowerCase();
      return handle === org || hostLabel === org;
    }));
  } catch { /* the directory being unreachable is not a reason to refuse the proof below */ }

  let accepted = false;
  let problem = '';
  if (!already) {
    try {
      // The same RS256 app token every directory read uses, minted here rather
      // than borrowed from the reader: the worker takes the address FROM this
      // token and ignores anything in the body, which is precisely what makes a
      // forwarded link useless to whoever receives it.
      const token = mintAppToken({ email: String(user.email || '').toLowerCase(), stateVersion: user.state_version || 1, accountId: user.id, billingEnabled: !!user.billing_enabled });
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
       <p><a class="act" href="/app/minerals">See your minerals</a></p>
       <p class="note">Open the Crads-AI app on the machine you want to use and sign in as ${who}. It makes a key here, keeps the private half, and the mineral takes it from there.</p>`
    : accepted
      ? `<h1>Accepted</h1>
         <p class="lead">You are signed in as <b>${who}</b>, and that is the address <b>${community}</b> invited.
         Your access opens as soon as the mineral picks this up, usually within a minute or two.</p>
         <p><a class="act" href="/app/minerals">See your minerals</a></p>
         <p class="note">If it is not listed shortly, the mineral may be asleep; it collects invitations when it wakes. Nothing is lost in the meantime.</p>`
      : `<h1>We could not finish that</h1>
         <p class="lead">${escapeHtml(problem || 'Something went wrong accepting the invitation.')}</p>
         <p class="note">You are signed in as ${who}. If the invitation was sent to a different address, sign out and sign in as that one, then click the link again.</p>`;

  return res.status(200).send(renderAppShell({ email: user.email, active: 'access', title: 'Invitation', main: body }));
};
