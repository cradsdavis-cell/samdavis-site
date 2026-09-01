'use strict';
// tests/appLogin.test.js — arc A5. Signing in is a product moment: the card
// speaks the app's language. Since the 2026-09-01 self-host pivot removed the
// hosted /app control plane, every auth entry point falls back to /account,
// the one signed-in surface left on the site.
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';

const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');
const LOGIN = read('account/login.html');

test('the card speaks the app language, not the site stylesheet', () => {
  assert.ok(!LOGIN.includes('/lib/site.css'), 'the coaching stylesheet is gone');
  assert.ok(LOGIN.includes('--accent:#A4582C'), 'the app palette is inline');
  assert.ok(LOGIN.includes('prefers-color-scheme: dark'), 'both themes');
  assert.ok(LOGIN.includes('crads<i>-ai</i>'), 'the product mark');
  assert.ok(LOGIN.includes('name="robots" content="noindex"'), 'stays out of search');
});

test('all three ruled methods survive, against the same endpoints', () => {
  assert.ok(LOGIN.includes('/api/auth/google/start'), 'Google');
  assert.ok(LOGIN.includes('/api/auth/login'), 'password sign-in');
  assert.ok(LOGIN.includes('/api/auth/register'), 'account creation');
  assert.ok(LOGIN.includes('/api/auth/request-link'), 'magic link');
  assert.ok(LOGIN.includes('minlength="10"'), 'the password floor is unchanged');
  assert.ok(/error=google/.test(LOGIN), 'the Google failure path still surfaces');
});

test('EVERY auth entry point lands on /account by default', () => {
  // Was a hardcoded '/app' at each site while the hosted control plane existed.
  // The 2026-09-01 self-host pivot removed /app, so the fallback is now the
  // account page — the only signed-in surface left. QA finding 46 still holds:
  // the destination stays caller-supplied (an invitation must survive the
  // sign-in it forces); what this pins is that /account is the FALLBACK
  // everywhere and no route 404s a fresh sign-in. The behavioural half lives
  // in authNextRedirect.test.js.
  const pw = read('lib/passwordAuth.js');
  assert.equal((pw.match(/redirect: landing\(req\)/g) || []).length, 3, 'register, login and set-password');
  assert.match(pw, /safeNext\(req && req\.body && req\.body\.next\) \|\| '\/account'/, 'and landing() falls back to /account');
  // the magic-link consumer
  assert.match(read('lib/authVerifyToken.js'), /safeNext\(req\.query && req\.query\.next\) \|\| '\/account'/);
  // Google
  assert.match(read('api/auth/google/callback.js'), /nextFrom\(req\) \|\| '\/account'/);
  // and the page's own fallback if a response ever arrives without one
  assert.match(LOGIN, /\|\| '\/account'\)/, 'the client fallback agrees');
});

test('no auth entry point can be pointed off-origin', () => {
  // The cost of a caller-supplied destination is an open redirect unless
  // exactly one guard decides. Five call sites, one decider.
  for (const f of ['lib/account.js', 'lib/passwordAuth.js', 'lib/authVerifyToken.js',
                   'api/auth/google/start.js', 'api/auth/google/callback.js',
                   'lib/authRequestSignin.js']) {
    assert.match(read(f), /require\(.*safeNext.*\)/, `${f} routes its destination through the guard`);
  }
});

test('sign-out still returns to this card, and the card still offers a way back to the site', () => {
  assert.match(read('api/auth/logout.js'), /\/account\/login/, 'logout lands on the sign-in card');
  assert.ok(LOGIN.includes('href="/"'), 'and the card is not a dead end');
});

test('the coaching onboarding flow keeps its own internal redirects', () => {
  // Its redirects are not auth entry points: a coaching client mid-onboarding
  // must still be sent to their own next step, not into the product app.
  assert.match(read('lib/onboardingStep.js'), /redirectTo: '\/account\/'/);
});
