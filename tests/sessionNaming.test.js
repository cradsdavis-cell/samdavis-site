'use strict';
// QA finding 57: a session the server could not classify was labelled with the
// bare word "Browser", beside a "Sign this session out" button. Every other row
// names itself, so the one row needing the most information gave the least, on
// the page whose only purpose is deciding what to kill. Sam found one of these
// and could not tell it was a curl sign-in from a test run.
const test = require('node:test');
const assert = require('node:assert');
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod-32-chars-min';
const { deviceLabel } = require('../lib/sessions');

test('recognised browsers still name themselves', () => {
  assert.match(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/127.0'), /Chrome on Windows/);
  assert.match(deviceLabel('Mozilla/5.0 (X11; Linux x86_64) Chrome/127.0'), /Chrome on Linux/);
  assert.match(deviceLabel('crads-ai-app/1.0'), /Crads-AI app/);
});

test('command-line tools are named as such, not called "Browser"', () => {
  for (const [ua, want] of [
    ['curl/8.5.0', /curl/i],
    ['Wget/1.21', /Wget/i],
    ['python-requests/2.31.0', /script or API client/i],
    ['node-fetch/3.3', /script or API client/i],
    ['PostmanRuntime/7.36', /script or API client/i],
  ]) {
    const got = deviceLabel(ua);
    assert.match(got, want, `${ua} -> ${got}`);
    assert.doesNotMatch(got, /^Browser$/, `${ua} must not be the bare word "Browser"`);
  }
});

test('an absent User-Agent says so rather than implying a browser', () => {
  const got = deviceLabel('');
  assert.doesNotMatch(got, /^Browser$/);
  assert.match(got, /no browser name|Unknown/i);
});

test('nothing is ever labelled the bare word "Browser" again', () => {
  for (const ua of ['', 'curl/8.5.0', 'something-nobody-has-heard-of/2', 'python-requests/2.31.0']) {
    assert.notStrictEqual(deviceLabel(ua).trim(), 'Browser', `bare "Browser" for: ${ua || '(empty)'}`);
  }
});
