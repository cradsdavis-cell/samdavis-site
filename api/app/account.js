'use strict';
// /app/account — who this account is. Deliberately thin for now: the identity
// facts, and honest pointers to the two things people look for here (password,
// and the desktop app's connection), rather than inventing settings that do not
// exist yet.
const { requireAuth } = require('../../lib/account');
const { defaultKv } = require('../../lib/kv');
const { renderAppShell, escapeHtml } = require('../../lib/appShell');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const created = String(user.created_at || '').slice(0, 10);
  const how = user.signup_source === 'google' ? 'Google' : 'email and password';

  const main = `
<h1>Account</h1>
<p class="lead">One account. Your minerals, your devices and your billing all hang off it.</p>
<div class="card">
  <h2>${escapeHtml(user.email)}</h2>
  <div class="sub">Signed up with ${escapeHtml(how)}${created ? ` &middot; ${escapeHtml(created)}` : ''}</div>
  <div class="chips">
    ${user.email_verified ? '<span class="chip good">email verified</span>' : '<span class="chip warn">email unverified</span>'}
  </div>
</div>
<div class="card">
  <h2>Password</h2>
  <div class="sub">Changing it signs out every machine, including the desktop app, within the hour.</div>
  <p class="note"><a class="act quiet" href="/account/set-password">Set or change your password</a></p>
</div>
<div class="card">
  <h2>The desktop app</h2>
  <div class="sub">The app signs in to this same account and stays signed in on that machine for about 60 days. You connect it from the app itself, not from here.</div>
  <p class="note">Machines that are signed in are listed under <a href="/app/devices">Devices</a>.</p>
</div>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderAppShell({ title: 'Account', active: 'account', email: user.email, main }));
};
