'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { safeNext, loginUrlFor } = require('../lib/safeNext');

test('safeNext keeps an ordinary same-origin path', () => {
  assert.strictEqual(safeNext('/access?org=coogee-labs'), '/access?org=coogee-labs');
  assert.strictEqual(safeNext('/app/minerals'), '/app/minerals');
  assert.strictEqual(safeNext('/'), '/');
  assert.strictEqual(safeNext('/app#section'), '/app#section');
});

test('safeNext refuses anything that could leave the origin', () => {
  // protocol-relative: the classic open-redirect
  assert.strictEqual(safeNext('//evil.example'), '');
  assert.strictEqual(safeNext('///evil.example'), '');
  // backslash variants, because several browsers normalise \ to /
  assert.strictEqual(safeNext('/\\evil.example'), '');
  assert.strictEqual(safeNext('\\\\evil.example'), '');
  assert.strictEqual(safeNext('\\/evil.example'), '');
  // absolute URLs in any scheme
  assert.strictEqual(safeNext('https://evil.example/x'), '');
  assert.strictEqual(safeNext('http://evil.example'), '');
  assert.strictEqual(safeNext('javascript:alert(1)'), '');
  assert.strictEqual(safeNext('data:text/html,x'), '');
  // relative paths that do not start at the root
  assert.strictEqual(safeNext('app/minerals'), '');
  assert.strictEqual(safeNext('../etc'), '');
});

test('safeNext refuses junk, control characters and absurd length', () => {
  assert.strictEqual(safeNext(undefined), '');
  assert.strictEqual(safeNext(null), '');
  assert.strictEqual(safeNext(''), '');
  assert.strictEqual(safeNext(42), '');
  assert.strictEqual(safeNext({}), '');
  assert.strictEqual(safeNext(['/app']), '');
  // a newline in a Location header is header injection
  assert.strictEqual(safeNext('/app\nSet-Cookie: x=1'), '');
  assert.strictEqual(safeNext('/app\r\nLocation: https://evil.example'), '');
  assert.strictEqual(safeNext('/app\tx'), '');
  assert.strictEqual(safeNext('/' + 'a'.repeat(2000)), '');
});

test('safeNext never returns the login page itself', () => {
  // else a bounced sign-in loops back to sign-in forever
  assert.strictEqual(safeNext('/account/login'), '');
  assert.strictEqual(safeNext('/account/login?next=%2Fapp'), '');
});

test('loginUrlFor carries the current URL, encoded', () => {
  assert.strictEqual(loginUrlFor('/access?org=coogee-labs'),
    '/account/login?next=%2Faccess%3Forg%3Dcoogee-labs');
  assert.strictEqual(loginUrlFor('/app/minerals'), '/account/login?next=%2Fapp%2Fminerals');
});

test('loginUrlFor falls back to a bare login page when there is nothing safe to return to', () => {
  assert.strictEqual(loginUrlFor('https://evil.example'), '/account/login');
  assert.strictEqual(loginUrlFor(undefined), '/account/login');
  assert.strictEqual(loginUrlFor('/account/login'), '/account/login');
});
