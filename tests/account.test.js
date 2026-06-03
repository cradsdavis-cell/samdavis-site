'use strict';
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-here';
const test = require('node:test');
const assert = require('node:assert');
const { requireAuth, renderSidebar, renderShell } = require('../lib/account');
const { makeKv } = require('../lib/kv');
const { signSession } = require('../lib/auth');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { store.delete(k); return 1; },
    incr: async () => 1, expire: async () => 1,
    keys: async (p) => Array.from(store.keys()).filter(k => k.startsWith(p.replace('*', ''))),
  };
}

function mockReq(cookie) { return { method: 'GET', headers: cookie ? { cookie } : {} }; }
function mockRes() {
  const r = { statusCode: 200, body: null, headers: {}, redirectTo: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.send = (b) => { r.body = b; return r; };
  r.redirect = (code, url) => { r.statusCode = code; r.redirectTo = url; return r; };
  r.end = () => r;
  return r;
}

test('requireAuth redirects to /account/login if no cookie', async () => {
  const kv = makeKv(fakeKvClient());
  const res = mockRes();
  const result = await requireAuth({ kv, req: mockReq(null), res });
  assert.strictEqual(result, null);
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.redirectTo, '/account/login');
});

test('requireAuth redirects if JWT invalid', async () => {
  const kv = makeKv(fakeKvClient());
  const res = mockRes();
  const result = await requireAuth({ kv, req: mockReq('session_jwt=garbage'), res });
  assert.strictEqual(result, null);
  assert.strictEqual(res.statusCode, 302);
});

test('requireAuth redirects if user record missing', async () => {
  const kv = makeKv(fakeKvClient());
  const jwt = signSession({ email: 'a@b.com', state_version: 1 });
  const res = mockRes();
  const result = await requireAuth({ kv, req: mockReq(`session_jwt=${jwt}`), res });
  assert.strictEqual(result, null);
});

test('requireAuth returns user record on valid JWT', async () => {
  const kv = makeKv(fakeKvClient());
  await kv.setUser('a@b.com', { email: 'a@b.com', state_version: 1, state: 'pre-s1' });
  const jwt = signSession({ email: 'a@b.com', state_version: 1 });
  const res = mockRes();
  const result = await requireAuth({ kv, req: mockReq(`session_jwt=${jwt}`), res });
  assert.strictEqual(result.email, 'a@b.com');
});

test('requireAuth redirects on state_version mismatch', async () => {
  const kv = makeKv(fakeKvClient());
  await kv.setUser('a@b.com', { email: 'a@b.com', state_version: 2 });
  const jwt = signSession({ email: 'a@b.com', state_version: 1 });
  const res = mockRes();
  const result = await requireAuth({ kv, req: mockReq(`session_jwt=${jwt}`), res });
  assert.strictEqual(result, null);
});

test('renderSidebar marks active route', () => {
  const html = renderSidebar({ activeRoute: 'sessions', isAdmin: false });
  assert.match(html, /<a [^>]*href="\/account\/sessions"[^>]*class="[^"]*active/);
  assert.doesNotMatch(html, /href="\/account\/admin"/);
});

test('renderSidebar shows admin link for admin user', () => {
  const html = renderSidebar({ activeRoute: 'home', isAdmin: true });
  assert.match(html, /href="\/account\/admin"/);
});

test('renderShell wraps content in HTML shell + sidebar + main', () => {
  const html = renderShell({ title: 'Home', activeRoute: 'home', isAdmin: false, mainContent: '<p>hi</p>' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<title>Home · crads-ai<\/title>/);
  assert.match(html, /sidebar-nav/);
  assert.match(html, /<p>hi<\/p>/);
});

test('requireAdmin returns 403 for non-admin user', async () => {
  const kv = makeKv(fakeKvClient());
  await kv.setUser('other@example.com', { email: 'other@example.com', state_version: 1 });
  const jwt = signSession({ email: 'other@example.com', state_version: 1 });
  const res = mockRes();
  const { requireAdmin } = require('../lib/account');
  const result = await requireAdmin({ kv, req: mockReq(`session_jwt=${jwt}`), res });
  assert.strictEqual(result, null);
  assert.strictEqual(res.statusCode, 403);
});

test('requireAdmin returns user for cradsdavis@gmail.com', async () => {
  const kv = makeKv(fakeKvClient());
  await kv.setUser('cradsdavis@gmail.com', { email: 'cradsdavis@gmail.com', state_version: 1 });
  const jwt = signSession({ email: 'cradsdavis@gmail.com', state_version: 1 });
  const res = mockRes();
  const { requireAdmin } = require('../lib/account');
  const result = await requireAdmin({ kv, req: mockReq(`session_jwt=${jwt}`), res });
  assert.strictEqual(result.email, 'cradsdavis@gmail.com');
});
