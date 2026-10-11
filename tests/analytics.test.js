// tests/analytics.test.js - what the site sends to Vercel Web Analytics is
// exactly what the privacy policy says: page views, plus two conversion clicks
// carrying only the from/to paths, and never the thanks page's payment reference.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE_JS = fs.readFileSync(path.join(ROOT, 'lib', 'site.js'), 'utf8');

function runSiteJs(href) {
  const sent = [];
  const clickHandlers = [];
  const doc = {
    head: { appendChild() {} },
    body: { insertBefore() {}, firstChild: null },
    createElement() { return { content: { firstElementChild: null } }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { if (type === 'click') clickHandlers.push(fn); },
    getElementById() { return null; },
    readyState: 'complete',
  };
  const win = { location: new URL(href), va: (...a) => sent.push(a) };
  win.document = doc;
  const sandbox = { window: win, document: doc, URL, console, setTimeout, module: undefined };
  try { vm.runInNewContext(SITE_JS, sandbox); } catch (e) { /* nav/other inits may need a real DOM */ }
  // site.js registers other click listeners too (the nav); call every one, as the browser would.
  const click = (href2) => {
    const ev = { target: { closest: () => ({ getAttribute: () => href2 }) } };
    for (const fn of clickHandlers) { try { fn(ev); } catch (e) { /* a nav listener on a fake DOM */ } }
  };
  return { sent, click, hasHandler: () => clickHandlers.length > 0 };
}

test('a click into booking or the download sends one event with from/to paths only', () => {
  const r = runSiteJs('https://crads-ai.com/docs/faq?utm_source=linkedin');
  assert.ok(r.hasHandler(), 'site.js registers a click listener');
  r.click('/book/roadmap?code=X');
  r.click('https://crads-ai.com/download');
  r.click('/docs/first-hour');
  r.click('https://example.com/book');
  // JSON round-trip: objects built inside the vm sandbox have that realm's prototypes.
  const events = JSON.parse(JSON.stringify(r.sent.filter((a) => a[0] === 'event')));
  assert.deepStrictEqual(events, [
    ['event', { name: 'Book click', data: { from: '/docs/faq', to: '/book/roadmap' } }],
    ['event', { name: 'Download click', data: { from: '/docs/faq', to: '/download' } }],
  ]);
});

test('the thanks page strips the payment reference before anything is recorded', () => {
  const html = fs.readFileSync(path.join(ROOT, 'thanks.html'), 'utf8');
  const i = html.indexOf("window.va('beforeSend'");
  assert.ok(i > -1, 'thanks.html registers beforeSend');
  assert.ok(i < html.indexOf('/_vercel/insights/script.js'), 'beforeSend is queued before the analytics script loads');
});
