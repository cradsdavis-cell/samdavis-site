# Account Booking Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the logged-in account from a one-way coaching funnel into a self-serve booking hub — book/rebook Single + Block, reschedule/cancel upcoming, fixed session display — reusing the existing checkout→webhook pipeline.

**Architecture:** Pure render helpers live in a new `lib/accountViews.js` (unit-testable); thin handlers (`api/account/book.js`, modified `sessions.js`/`index.js`) call `requireAuth` then render. Booking reuses the existing `/api/checkout` flow via the public slot-picker, extended with an optional locked-identity mode. Reschedule/cancel are Cal-hosted links keyed by booking `uid`. No new payment or refund code.

**Tech Stack:** Node 20 CommonJS serverless functions on Vercel; `node:test` + `node:assert`; Redis (`ioredis`); Cal.com API v2; vanilla-JS slot picker.

**Spec:** `docs/superpowers/specs/2026-06-16-account-booking-hub-design.md`

---

## File Structure

- `lib/calBookings.js` (modify) — F0.1 status-case fix (2 spots) + new `calManageUrl(uid)`.
- `lib/accountViews.js` (create) — pure render helpers: `renderBookChoices`, `renderBookPicker`, `renderUpcomingBooking`, `renderBookCta`.
- `lib/account.js` (modify) — add `book` route to sidebar; add optional `head` param to `renderShell`.
- `api/account/book.js` (create) — GET handler: choice page, or picker page when `?sku=` set.
- `api/account/sessions.js` (modify) — render upcoming with reschedule/cancel + a book CTA.
- `api/account/index.js` (modify) — dashboard: add book/manage panel.
- `book/_slot-picker.js` (modify) — optional locked-identity mode.
- `vercel.json` (modify) — rewrite `/account/book` → `/api/account/book`.
- `tests/calBookings.test.js` (create), `tests/accountViews.test.js` (create).

Run all tests: `npm test`. Single file: `node --test tests/<file>.test.js`.

---

## Task 0: Persistence verification (no code unless a gap is found)

- [ ] **Step 1: Confirm Redis durability reasoning.** `lib/kv.js` uses `ioredis` with `REDIS_URL`. If unset, `ioredis` connects to localhost:6379 and prod auth would already be failing. Confirm prod login works (Sam logs into his own account at https://crads-ai.com/account/login and stays logged in). Record verdict.
- [ ] **Step 2: Confirm booking→account link.** In `api/stripe/webhook.js`, confirm `createOrUpdateUser` is called on `checkout.session.completed` and matches by email. (Read-only confirmation; already verified in spec.)
- [ ] **Step 3:** After Task 1 ships, Sam confirms the 19-Jun (or any future) booking now appears under `/account/sessions` → "Upcoming". If it does, persistence + display are sound. If not, stop and investigate before further tasks.

---

## Task 1: Fix Cal status-case bug + add `calManageUrl`

**Files:**
- Modify: `lib/calBookings.js`
- Test: `tests/calBookings.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/calBookings.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fetchUpcomingAndPast, fetchNextSession, calManageUrl } = require('../lib/calBookings');

function stubFetch(bookings) {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: bookings }) });
}

test('upcoming includes lowercase-status "accepted" bookings', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  stubFetch([{ uid: 'abc', status: 'accepted', start: future, eventType: { title: 'Coaching Block' } }]);
  const { upcoming } = await fetchUpcomingAndPast('x@example.com');
  assert.strictEqual(upcoming.length, 1);
  assert.strictEqual(upcoming[0].uid, 'abc');
});

test('fetchNextSession returns a lowercase-accepted booking', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  stubFetch([{ uid: 'abc', status: 'accepted', start: future, eventType: { title: 'Coaching Block' } }]);
  const next = await fetchNextSession('x@example.com');
  assert.ok(next, 'expected a next session');
  assert.strictEqual(next.label, 'Coaching Block');
});

test('calManageUrl builds the Cal booking-management URL from a uid', () => {
  assert.strictEqual(calManageUrl('4TyhQHAda6qry8RFY1m6gs'), 'https://cal.com/booking/4TyhQHAda6qry8RFY1m6gs');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/calBookings.test.js`
Expected: FAIL — `upcoming.length` is 0 (filter wants uppercase `'ACCEPTED'`), and `calManageUrl` is `undefined` (not exported yet).

- [ ] **Step 3: Implement the fix in `lib/calBookings.js`**

Replace both occurrences of:
```js
.filter(b => b.status === 'ACCEPTED' && new Date(b.start) > now)
```
with:
```js
.filter(b => String(b.status).toUpperCase() === 'ACCEPTED' && new Date(b.start) > now)
```

Add before `module.exports`:
```js
function calManageUrl(uid) {
  return `https://cal.com/booking/${uid}`;
}
```

Update the exports line to include it:
```js
module.exports = { fetchBookings, fetchNextSession, fetchUpcomingAndPast, calManageUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/calBookings.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/calBookings.js tests/calBookings.test.js
git commit -m "fix(account): match Cal status case-insensitively so upcoming sessions render

The Cal v2 API returns status 'accepted' (lowercase) but calBookings filtered
on 'ACCEPTED', so every upcoming booking was dropped. Also adds calManageUrl()."
```

---

## Task 2: Pure account-view render helpers

**Files:**
- Create: `lib/accountViews.js`
- Test: `tests/accountViews.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/accountViews.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderBookChoices, renderBookPicker, renderUpcomingBooking, renderBookCta } = require('../lib/accountViews');
const { SKUS } = require('../lib/skus');

const user = { name: 'Jo Tse', email: 'jo@example.com' };

test('renderBookChoices lists the two slot-based SKUs with prices + links', () => {
  const html = renderBookChoices(user);
  assert.match(html, /Single Session/);
  assert.match(html, /Coaching Block/);
  // Derive prices from the SKU source of truth so the test never rots on a reprice.
  assert.ok(html.includes('$' + SKUS['single-session'].price_aud.toLocaleString('en-US')));
  assert.ok(html.includes('$' + SKUS['coaching-block'].price_aud.toLocaleString('en-US')));
  assert.match(html, /\/account\/book\?sku=single-session/);
  assert.match(html, /\/account\/book\?sku=coaching-block/);
});

test('renderBookPicker injects SKU + locked identity (JSON-escaped email)', () => {
  const html = renderBookPicker(user, 'coaching-block');
  assert.match(html, /window\.SKU_SLUG='coaching-block'/);
  assert.match(html, /window\.IS_PAID=true/);
  assert.match(html, /window\.LOCK_IDENTITY=true/);
  assert.match(html, /"email":"jo@example.com"/);
  assert.match(html, /id="slot-picker"/);
  assert.match(html, /\/book\/_slot-picker\.js/);
});

test('renderBookPicker rejects unknown / non-slot SKUs', () => {
  assert.throws(() => renderBookPicker(user, 'group-block'));
  assert.throws(() => renderBookPicker(user, 'nonsense'));
});

test('renderUpcomingBooking shows the manage link + 24h policy', () => {
  const b = { uid: 'XYZ', status: 'accepted', start: '2026-06-19T02:30:00.000Z', eventType: { title: 'Coaching Block' } };
  const html = renderUpcomingBooking(b);
  assert.match(html, /https:\/\/cal\.com\/booking\/XYZ/);
  assert.match(html, /Reschedule or cancel/i);
  assert.match(html, /24h/);
});

test('renderBookCta links to the account book page', () => {
  assert.match(renderBookCta(), /href="\/account\/book"/);
  assert.match(renderBookCta(), /Book another session/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/accountViews.test.js`
Expected: FAIL — `Cannot find module '../lib/accountViews'`.

- [ ] **Step 3: Implement `lib/accountViews.js`**

```js
'use strict';
const { SKUS } = require('./skus');
const { calManageUrl } = require('./calBookings');

// Only these SKUs book a Cal slot from inside the account (group = cohort,
// retainer = out-of-band). Spec § "Current state".
const BOOKABLE = [
  { slug: 'single-session', name: 'Single Session', blurb: 'One specific pain, one working piece.' },
  { slug: 'coaching-block', name: 'Coaching Block', blurb: 'Four 1:1 sessions, full personalised pack between each.' },
];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtPrice(aud) {
  return '$' + Number(aud).toLocaleString('en-US');
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
}

function renderBookCta() {
  return `<a href="/account/book" class="cta">Book another session →</a>`;
}

function renderBookChoices(user) {
  const cards = BOOKABLE.map(s => {
    const def = SKUS[s.slug];
    return `
      <div class="book-card">
        <h2>${esc(s.name)}</h2>
        <div class="meta">${fmtPrice(def.price_aud)} AUD</div>
        <p class="for">${esc(s.blurb)}</p>
        <a class="book-cta" href="/account/book?sku=${esc(s.slug)}">Pick a time →</a>
      </div>`;
  }).join('');
  return `
    <h1 class="serif">Book a session</h1>
    <div class="book-grid">${cards}</div>
    <section class="panel">
      <div class="panel-title">Other options</div>
      <div class="panel-content">
        <a href="/group">Group Block — next cohort →</a> ·
        <a href="/offer">Continuation Retainer →</a>
      </div>
    </section>`;
}

function renderBookPicker(user, sku) {
  const def = SKUS[sku];
  if (!def || !BOOKABLE.some(b => b.slug === sku)) {
    throw new Error(`not a slot-bookable sku: ${sku}`);
  }
  const identity = JSON.stringify({ name: user.name || '', email: user.email });
  const name = BOOKABLE.find(b => b.slug === sku).name;
  return `
    <p><a href="/account/book">← All options</a></p>
    <div class="book-header">
      <h1>${esc(name)}</h1>
      <p>${fmtPrice(def.price_aud)} AUD · pay on booking. Booking as ${esc(user.email)}.</p>
    </div>
    <div id="slot-picker"></div>
    <script>window.SKU_SLUG=${JSON.stringify(sku)};window.IS_PAID=true;window.BOOK_IDENTITY=${identity};window.LOCK_IDENTITY=true;</script>
    <script src="/book/_slot-picker.js"></script>`;
}

function renderUpcomingBooking(b) {
  const title = (b.eventType && b.eventType.title) || b.title || 'Session';
  const manage = calManageUrl(b.uid);
  return `<li>${esc(title)} — ${esc(fmtDate(b.start))}
    ${b.uid ? `· <a href="${manage}" target="_blank" rel="noopener">Reschedule or cancel</a> <span class="hint">(24h notice policy)</span>` : ''}</li>`;
}

module.exports = { renderBookChoices, renderBookPicker, renderUpcomingBooking, renderBookCta, BOOKABLE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/accountViews.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/accountViews.js tests/accountViews.test.js
git commit -m "feat(account): pure render helpers for booking hub (choices, picker, upcoming, CTA)"
```

---

## Task 3: `renderShell` head param + sidebar `book` route

**Files:**
- Modify: `lib/account.js`

- [ ] **Step 1: Add the `book` sidebar item.** In `renderSidebar`, insert after the `home` item:
```js
    { route: 'book', href: '/account/book', label: 'Book' },
```
(so the order is Home, Book, Sessions, Packs, Subscription, Profile).

- [ ] **Step 2: Add an optional `head` param to `renderShell`.** Change the signature to:
```js
function renderShell({ title, activeRoute, isAdmin: admin, mainContent, head }) {
```
and insert `${head || ''}` immediately before the closing `</head>`:
```js
  <meta name="robots" content="noindex">
  ${head || ''}
</head>
```

- [ ] **Step 3: Verify nothing breaks.** Run: `npm test`
Expected: PASS (existing suite unaffected — `head` defaults to `''`, new sidebar item is additive).

- [ ] **Step 4: Commit**

```bash
git add lib/account.js
git commit -m "feat(account): renderShell head slot + Book sidebar item"
```

---

## Task 4: `/account/book` handler + rewrite

**Files:**
- Create: `api/account/book.js`
- Modify: `vercel.json`

- [ ] **Step 1: Create `api/account/book.js`**

```js
'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderBookChoices, renderBookPicker } = require('../../lib/accountViews');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const sku = req.query && req.query.sku ? String(req.query.sku) : '';
  let mainContent;
  try {
    mainContent = sku ? renderBookPicker(user, sku) : renderBookChoices(user);
  } catch {
    // unknown/non-slot sku → fall back to the choices page
    mainContent = renderBookChoices(user);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Book',
    activeRoute: 'book',
    isAdmin: isAdmin(user.email),
    mainContent,
    head: '<link rel="stylesheet" href="/book/_styles.css">',
  }));
};
```

- [ ] **Step 2: Add the rewrite in `vercel.json`.** In the `"rewrites"` array, add:
```json
    { "source": "/account/book", "destination": "/api/account/book" },
```
(place it alongside the other `/account/*` rewrites).

- [ ] **Step 3: Verify the suite still passes.** Run: `npm test`
Expected: PASS (handler isn't unit-tested — its logic is the tested helpers; this just confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add api/account/book.js vercel.json
git commit -m "feat(account): /account/book hub page (choices + identity-locked picker)"
```

---

## Task 5: Locked-identity mode in the slot picker

**Files:**
- Modify: `book/_slot-picker.js`

No DOM test harness exists in the repo, so this task is verified manually. Keep the change strictly backward-compatible: behaviour is unchanged unless `window.LOCK_IDENTITY` is set.

- [ ] **Step 1: Read identity globals.** Near the top of the IIFE (after `const isPaid = window.IS_PAID;`), add:
```js
  const lockIdentity = !!window.LOCK_IDENTITY && window.BOOK_IDENTITY && window.BOOK_IDENTITY.email;
  const identity = window.BOOK_IDENTITY || {};
```

- [ ] **Step 2: Branch the form render.** In `renderForm()`, replace the two name/email `.field` blocks with a conditional. The function becomes:
```js
  function renderForm() {
    const identityFields = lockIdentity
      ? `<p class="book-as">Booking as <strong>${escapeAttr(identity.name || identity.email)}</strong> (${escapeAttr(identity.email)}).</p>
         <input type="hidden" name="name" value="${escapeAttr(identity.name || '')}">
         <input type="hidden" name="email" value="${escapeAttr(identity.email)}">`
      : `<div class="field"><label for="bk-name">Your name</label><input id="bk-name" type="text" name="name" autocomplete="name" required></div>
         <div class="field"><label for="bk-email">Email</label><input id="bk-email" type="email" name="email" autocomplete="email" required></div>`;
    return `
      <form id="slot-form" class="slot-form" style="display:none;">
        <p><strong>Selected:</strong> <span id="selected-label"></span></p>
        ${identityFields}
        <input type="hidden" name="slot_iso" id="slot-iso">
        <button class="book-cta" type="submit" id="submit-btn">
          ${isPaid ? 'Book + Pay →' : 'Book →'}
        </button>
        <p id="submit-error" class="slot-error" style="display:none; margin-top:1rem;"></p>
      </form>`;
  }
```

- [ ] **Step 3: Add an attribute-escaper.** Add near `fmtTime`:
```js
  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
```
(The existing `onSubmit` already reads `fd.get('name')` / `fd.get('email')`, so hidden inputs flow through unchanged.)

- [ ] **Step 4: Manual verification.**
  1. `npm test` still passes (no JS test touches this file, but confirm no syntax error: `node -e "require('fs').readFileSync('book/_slot-picker.js','utf8')"` then `node --check book/_slot-picker.js`).
  2. Locally / on a preview deploy: open `/book/single-session` (public) — name+email fields still show and work (regression check).
  3. Open `/account/book?sku=single-session` while logged in — see "Booking as …", no editable email; pick a slot → checkout uses the account email.

- [ ] **Step 5: Commit**

```bash
git add book/_slot-picker.js
git commit -m "feat(book): optional locked-identity mode for in-account booking"
```

---

## Task 6: Wire upcoming reschedule/cancel + book CTAs into the account pages

**Files:**
- Modify: `api/account/sessions.js`
- Modify: `api/account/index.js`

- [ ] **Step 1: Sessions page — use the new renderers.** In `api/account/sessions.js`:
  - Add to the imports: `const { renderUpcomingBooking, renderBookCta } = require('../../lib/accountViews');`
  - Replace the `upcomingHtml` line so upcoming uses `renderUpcomingBooking`:
```js
  const upcomingHtml = upcoming.length
    ? `<ul class="panel-content">${upcoming.map(renderUpcomingBooking).join('')}</ul>`
    : `<div class="panel-content">No upcoming bookings.</div>`;
```
  - Keep `renderBookingItem` for the `past` list (unchanged).
  - At the top of `mainContent`, add the CTA + the policy note:
```js
    <h1 class="serif">Sessions</h1>
    <div class="panel-content" style="margin-bottom:1rem;">${renderBookCta()}</div>
    <p class="book-policy">Reschedule/cancel opens Cal. Policy: >24h notice = full refund or free reschedule; inside 24h = no refund, one reschedule offered.</p>
```

- [ ] **Step 2: Dashboard — add a book/manage panel.** In `api/account/index.js`, add to imports: `const { renderBookCta } = require('../../lib/accountViews');` and add a panel after the hero, before Quick links:
```js
    <section class="panel">
      <div class="panel-title">Book &amp; manage</div>
      <div class="panel-content">
        ${renderBookCta()} &nbsp;·&nbsp; <a href="/account/sessions">Your sessions →</a>
      </div>
    </section>
```

- [ ] **Step 3: Verify suite + syntax.** Run: `npm test` then `node --check api/account/sessions.js && node --check api/account/index.js`
Expected: PASS / no output (valid).

- [ ] **Step 4: Manual verification.** Logged in: dashboard shows "Book another session →" and (after Task 1) the next session; `/account/sessions` shows upcoming with a working "Reschedule or cancel" link and the 24h policy line.

- [ ] **Step 5: Commit**

```bash
git add api/account/sessions.js api/account/index.js
git commit -m "feat(account): surface book CTA + reschedule/cancel on dashboard and sessions"
```

---

## Task 7: Final verification + PR

- [ ] **Step 1: Full test run.** Run: `npm test` — Expected: all suites PASS.
- [ ] **Step 2: Open-item checks (spec § Open items).** Verify `https://cal.com/booking/<uid>` resolves to a page with reschedule + cancel for a test booking Sam controls. If Cal's hosted URL differs, update `calManageUrl` in `lib/calBookings.js` (fallback: Cal v2 API `POST /v2/bookings/{uid}/cancel` + `/reschedule` behind a thin `api/account/cancel.js`/`reschedule.js` — only if hosted links don't work).
- [ ] **Step 3: Push + PR** against `main`, body summarising the foundation fix + the three features, link to the spec.
- [ ] **Step 4:** Sam reviews on a Vercel preview deploy before merge (live payments site — same gate as PR #18).

---

## Self-review notes

- **Spec coverage:** F0.1 status fix → Task 1; persistence verify → Task 0; in-account booking → Tasks 2–5; reschedule/cancel → Tasks 2 (helper) + 6; dashboard reframe → Task 6. ✓
- **Type consistency:** `calManageUrl` defined in Task 1, used in Task 2. `renderBookChoices/renderBookPicker/renderUpcomingBooking/renderBookCta` defined in Task 2, imported in Tasks 4 & 6. `renderShell` `head` param added in Task 3, used in Task 4. ✓
- **No refund/payment code** is introduced anywhere — reschedule/cancel are Cal-hosted links, booking reuses `/api/checkout`. ✓
