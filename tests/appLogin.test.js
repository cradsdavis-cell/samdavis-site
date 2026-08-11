'use strict';
// tests/appLogin.test.js — arc A5. Signing in is a product moment: the card
// speaks the app's language, and EVERY auth entry point lands in /app rather
// than the coaching dashboard. The failure this prevents is a member signing
// in from the Crads-AI app and landing in "Book a session / Packs".
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

test('EVERY auth entry point lands in /app by default', () => {
  // Was a hardcoded '/app' at each site. QA finding 46 made the destination
  // caller-supplied (an invitation must survive the sign-in it forces), so what
  // this pins now is that /app is still the FALLBACK everywhere, and that the
  // failure it was written for — landing a member in the coaching dashboard —
  // is still impossible. The behavioural half lives in authNextRedirect.test.js.
  const pw = read('lib/passwordAuth.js');
  assert.equal((pw.match(/redirect: landing\(req\)/g) || []).length, 3, 'register, login and set-password');
  assert.match(pw, /safeNext\(req && req\.body && req\.body\.next\) \|\| '\/app'/, 'and landing() falls back to /app');
  assert.ok(!/redirect: '\/account\/'/.test(pw), 'none of them still points at the coaching dashboard');
  // the magic-link consumer
  assert.match(read('lib/authVerifyToken.js'), /safeNext\(req\.query && req\.query\.next\) \|\| '\/app'/);
  // Google
  assert.match(read('api/auth/google/callback.js'), /nextFrom\(req\) \|\| '\/app'/);
  // and the page's own fallback if a response ever arrives without one
  assert.match(LOGIN, /\|\| '\/app'\)/, 'the client fallback agrees');
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
