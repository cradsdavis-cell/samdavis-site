# SECURITY.md — samdavis-site (crads-ai.com)

**Audit date:** 2026-05-18
**Auditor:** Claude Opus 4.7
**Scope:** Vercel serverless booking system (api/, lib/, book/, vercel.json, package.json)
**Mode at audit time:** Stripe test mode (sk_test_…). Live-mode flip pending.

---

## Summary

No CRITICAL findings. Three HIGH findings centre on the free Discovery endpoint, which is unauthenticated and can be abused to (1) spam the calendar with phony bookings using arbitrary email addresses, (2) trigger outbound email from Sam's domain to victim addresses (reputation risk on the same domain that handles real customer payment receipts), and (3) be reshaped by a client-supplied query param without rate limiting. Eight MEDIUM findings cluster around defence-in-depth gaps (no input validation on email/name, error responses that leak upstream body, no CORS, no rate limiting, idempotency window in webhook). Stripe webhook signature verification is implemented correctly; secrets are correctly server-side only; no env vars leak to client code; `npm audit` is clean; no secrets in git history. The system is safe to flip to live mode after the HIGH items are addressed and the live-mode checklist at the end of this doc is walked through.

---

## Findings

### HIGH-1 — Free Discovery endpoint is unauthenticated; spammable; calendar DoS

**File:** `api/checkout.js:17-31`

The free path is triggered by either `?free=1` query param OR `sku === 'discovery'`. With **no** rate limit, CAPTCHA, email verification, honeypot, or origin check, an attacker can `curl -X POST https://crads-ai.com/api/checkout` in a loop with fake names + arbitrary email addresses and book every Discovery slot in Sam's calendar within seconds. Cal will accept up to whatever the event-type's daily cap is, then return errors — at which point Sam's real prospects can't book.

Compounding: the booking triggers a Cal-side confirmation email to the attacker-supplied address, so Sam's domain becomes an unauthenticated email vector to arbitrary victims (see HIGH-2).

**Fix options (pick one or layer):**
1. Vercel Edge Middleware rate-limit by IP — e.g. 5 free bookings per IP per hour. Cheapest fix.
2. Double-opt-in: free booking creates a *pending* record + sends a magic-link email; only confirmation creates the Cal booking. Highest friction, highest assurance.
3. Cloudflare Turnstile (CAPTCHA) on the client form — easy to integrate, defeats casual scripted abuse but not headless-browser determined.
4. Require email-domain reachability (MX record check) server-side — eliminates `test@nowhere.invalid` spam but not real-domain spoof.

Recommendation: 1 + 3 for v1.

---

### HIGH-2 — Email injection / domain-reputation risk via attacker-controlled `to:` + `name:`

**File:** `lib/email.js:13`, `lib/email.js:16`

`sendRaceLossEmail` interpolates the customer-supplied `name` directly into the email body (`Hi ${name},`). Resend's API does the right thing with the `to:` field (single string → no header injection), so classic SMTP CRLF injection is not possible. **However:**

- `name` is unbounded text — an attacker can stuff phishing copy, links, or 10 KB of content into the body and have it sent *from* `hello@crads-ai.com` *to* any victim address by triggering a race-loss (combine with HIGH-1).
- The `to:` address itself is whatever the attacker put in `email` on the original checkout — the system has never verified the address belongs to anyone real or that they consented to receive mail.
- Repeated abuse will get `crads-ai.com` flagged by Gmail/Microsoft spam filters, blowing up the *real* customer flow (Stripe receipts + race-loss notifications).

**Fix:**
1. Cap `name` at 80 chars before storing in Stripe metadata (`api/checkout.js`) and re-validate before email interpolation.
2. Strip control chars + URLs from `name` before email body interpolation, OR HTML-encode if switching to HTML email.
3. Address HIGH-1 (no spam route → no email-reputation route).
4. Set up SPF/DKIM/DMARC on `crads-ai.com` properly with Resend (verify in DNS) — limits blast radius if reputation does drop.

---

### HIGH-3 — Client can supply `sku` to free path; logic gate is shallow

**File:** `api/checkout.js:17-19`

`isFree` is true if `req.query.free === '1'` OR `sku === 'discovery'`. The defense is `if (sku !== 'discovery') { res.status(400)... }`. That works *today* — but the gate is one line that's easy to break in a future refactor, and the logic is the *only* thing standing between a malicious `POST /api/checkout?free=1 {sku: "ea-basic-build"}` and a free $2,000 booking.

**Fix:**
- Server should derive `isFree` purely from `sku === 'discovery'` and ignore `?free=1`. The query param adds no security value and creates a parallel code path.
- Add a server-side allow-list assertion: `if (isFree && sku !== 'discovery') throw new Error('paid_sku_cannot_be_free')` is already there but should be the only branch — drop the query-param OR.

---

### MEDIUM-1 — No input validation on `email`, `name`, `slot_iso`

**File:** `api/checkout.js:10-14`

Existence-checked but not format-checked. Garbage `email: "not an email"` flows into Stripe (which will reject), Cal (which may accept), and Resend (which will reject). `slot_iso` is forwarded unchanged to Cal — an attacker can probe Cal's API with arbitrary strings via Sam's authenticated path. `name` length is unbounded (see HIGH-2).

**Fix:** validate before forwarding. `slot_iso` against an ISO-8601 regex; `email` against a basic regex + max 254 chars (RFC 5321); `name` against 80-char cap, control-char strip.

---

### MEDIUM-2 — Upstream error bodies leaked to the client

**Files:** `api/checkout.js:28`, `api/cal/availability.js:26`, `api/booking-status.js:11`

`res.status(502).json({ error: 'cal_upstream', status: ..., body: cal.body })` returns Cal's raw error body to the public caller. Cal's error responses can include eventTypeId echoes, internal field names, validation hints — useful intelligence for an attacker mapping the Cal account. `api/checkout.js:43` also leaks `err.message` from the Stripe SDK directly to the response on the paid path.

**Fix:** log full upstream errors server-side (Vercel function logs); return generic `{ error: 'upstream' }` to the client.

---

### MEDIUM-3 — Webhook idempotency window assumes `take=100` is enough

**File:** `lib/cal.js:48-53`

`findBookingByStripeSession` fetches the 100 most recent bookings and filters client-side for matching `stripe_session_id`. If Sam's calendar ever sees >100 bookings between a duplicate webhook delivery and the original, the idempotency check returns no match and `createBooking` runs a second time → double-booking + slot held twice for one payment. Realistic at low volume now; will not scale.

**Fix:** maintain a separate idempotency store (KV / Upstash Redis on Vercel; key = stripe session id; TTL 30 days). Cal-side check stays as a backstop. Until then, document the limit in `lib/cal.js`.

---

### MEDIUM-4 — No CORS headers; relies on browser same-origin

**Files:** all `api/*.js`

No `Access-Control-Allow-Origin` is set, which means same-origin is enforced by the browser by default — fine for the legit booking UI. But there's no preflight rejection either; non-browser clients (curl, scripts, bots) can hit every endpoint freely. This is the same surface as HIGH-1; the CORS gap doesn't introduce new risk but it eliminates browser-based defence.

**Fix:** explicit `Access-Control-Allow-Origin: https://crads-ai.com` on `/api/checkout` + `/api/cal/availability` + `/api/booking-status`. Webhook is correctly POST-only with signature verify — needs no CORS.

---

### MEDIUM-5 — No rate limiting anywhere

**Files:** all `api/*.js`

`api/cal/availability` is a GET that an attacker can hammer to map Sam's calendar (when meetings are booked, what times he keeps free). Not a high-value target but a privacy gap. `api/checkout` (paid path) creates Stripe checkout sessions — Stripe API has rate limits, but burning through them DoSes legit customers and may incur cost. `api/booking-status` polled at high rate could amplify Cal API quota usage.

**Fix:** Vercel Edge Middleware with `@upstash/ratelimit` — 60 req/min/IP global, 10 req/min/IP for /api/checkout. Trivial to add.

---

### MEDIUM-6 — Webhook race-loss path: refund failure surfaces as 200 to Stripe

**File:** `api/stripe/webhook.js:79-87`

If refund or race-loss email fails inside the catch, the handler still returns 200 (the outer `res.status(200).json({ ..., refunded: true })` at line 86 runs after the alert). Stripe sees success and won't retry; Sam gets one alert email and has to recover manually. Today this is a manual-toil cost, not a security issue, but in live mode it means a customer is charged + no refund + no email.

**Fix:** return 500 inside the catch so Stripe retries the webhook; Sam alert is best-effort but Stripe's retry queue is the durable recovery channel. Track refund success explicitly.

---

### MEDIUM-7 — `customer_email` in webhook trusted as-is

**File:** `api/stripe/webhook.js:40,55`

Webhook reads `customer_email` off the Stripe session and forwards it to Cal + Resend. Stripe populates this from what the client submitted in `api/checkout.js` — it's not verified by Stripe. If a malicious user supplies someone else's email, the booking confirmation + race-loss email goes to the victim. Lower than HIGH-2 because the paid path has a $150+ cost gate, but still a vector.

**Fix:** for the paid path, prefer using `customer_details.email` (Stripe-collected during Checkout) over the metadata-derived `customer_email`. Stripe's Checkout collects email from the cardholder; it's stronger evidence of consent.

---

### MEDIUM-8 — Booking-status leaks payment state to anyone with a session ID

**File:** `api/booking-status.js`

Endpoint takes a Stripe session ID as a query param and returns `{ confirmed, refunded }`. Stripe session IDs are 50+ chars of opaque entropy (`cs_test_a1b2c3…`) — practically unguessable — but they appear in URL bars, browser history, server logs, and referer headers. Anyone who obtains a session ID (e.g. from a shared screenshot, support email, or proxy log) can query whether a booking was confirmed or refunded for that session. Low real-world exploitability; defence-in-depth gap.

**Fix:** require a paired secret (e.g. HMAC of session ID + a server secret, returned to the client in `checkout_url` flow and persisted in localStorage), or accept the risk and document it.

---

### LOW-1 — `from:` addresses hard-coded; no Reply-To set

**File:** `lib/email.js:13,31`

`from: 'Sam Davis <hello@crads-ai.com>'` — if `hello@` isn't actually a monitored inbox, customers replying to race-loss notifications will hit the void. Set `Reply-To: cradsdavis@gmail.com` explicitly.

---

### LOW-2 — Webhook returns `{ error: 'invalid_signature', message: err.message }`

**File:** `api/stripe/webhook.js:30`

Stripe SDK error messages can include header offsets / timing details. Replace with `{ error: 'invalid_signature' }` — Stripe doesn't read the body.

---

### LOW-3 — `tests/` excluded via .vercelignore but not enforced server-side

`tests/checkout.test.js:8` mutates `process.env.STRIPE_PRICE_SINGLE` at module load. If tests ever shipped to production by accident, env contamination at cold start. Vercel ignores `tests/` per `.vercelignore`, so this is theoretical — but worth a CI check that `.vercelignore` lists `tests/`.

---

### LOW-4 — Slot-picker `innerHTML` interpolates Cal data without escaping

**File:** `book/_slot-picker.js:77,82`

`html += \`<button class="slot-button" data-iso="${iso}">${fmtTime(iso)}</button>\``. `iso` comes from Cal's `/slots/available` response. If Cal ever returns attacker-controlled content (which would require a Cal bug), it would be injected into the DOM unescaped. Not exploitable today; switch to `textContent` + `dataset.iso` for hygiene.

---

### LOW-5 — No Content-Security-Policy / security headers

`vercel.json` only sets `Cache-Control: no-store` on the webhook. Missing: CSP, X-Content-Type-Options, Referrer-Policy, Strict-Transport-Security (Vercel sets HSTS by default but worth confirming).

**Fix:** add a `headers` block in `vercel.json` setting `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP allowing Stripe + Cal.

---

### LOW-6 — `.gitignore` allows `.env` but not bare `.env`

`.gitignore` line: `.env*.local`. Bare `.env` and `.env.production` are NOT ignored. If Sam ever creates `c:/tmp/samdavis-site/.env` with real keys, `git add .` will stage it. Verified no `.env` exists today; harden the rule.

**Fix:** add `.env`, `.env.*`, `!.env.example` to `.gitignore`.

---

## Verified clean

- **No secrets in git history.** `git log -S "sk_test"` only matches commit `1e5e4c3` which adds the Stripe wrapper *file*, not a key. `STRIPE_SECRET_KEY` etc. only appear as `process.env.*` references in `lib/`.
- **`process.env` never used client-side.** Only in `api/*.js`, `lib/*.js`, and `tests/`. No HTML or browser JS references `process.env`.
- **Stripe webhook signature verification is correct.** Raw body buffered (`bodyParser: false`), passed to `stripe.webhooks.constructEvent` which verifies HMAC + timestamp + tolerance window. Replay outside the default 5-minute window is rejected.
- **`npm audit`: 0 vulnerabilities** across 96 dependencies (stripe@^14, resend@^3 + transitive).
- **`STRIPE_SECRET_KEY`, `CAL_API_KEY`, `RESEND_API_KEY` are server-side only.** Never sent to client; never logged in error bodies.

---

## Live-mode pre-flip checklist

Before swapping `STRIPE_SECRET_KEY` test → live and accepting real money:

1. [ ] **Fix HIGH-1** — rate limit `/api/checkout` (free path especially). Single biggest risk.
2. [ ] **Fix HIGH-2 + HIGH-3** — cap `name` length; collapse `?free=1` gate; verify free path only fires for `sku === 'discovery'`.
3. [ ] **Rotate `STRIPE_WEBHOOK_SECRET`** — generate a fresh `whsec_…` in Stripe Live Dashboard. Do NOT reuse the test secret.
4. [ ] **Update Stripe webhook endpoint in Live Dashboard** to `https://crads-ai.com/api/stripe/webhook`, subscribed to `checkout.session.completed` (only).
5. [ ] **Verify SPF + DKIM + DMARC** records for `crads-ai.com` in Cloudflare DNS — Resend dashboard should show all green. Otherwise race-loss emails land in spam.
6. [ ] **Confirm `hello@crads-ai.com` and `alerts@crads-ai.com` are configured / forwarding** to Sam's real inbox (or add a `Reply-To` per LOW-1).
7. [ ] **Smoke test** with a real $1 SKU (temporary low-price test): full checkout → webhook → Cal booking → confirmation email. Then refund via Stripe Dashboard to test refund path. Then race-loss simulate (book Cal slot manually mid-checkout) to test refund + race-loss email.
8. [ ] **Set `SAM_ALERT_EMAIL`** in Vercel prod to Sam's monitored inbox (not the same address as `from:` to avoid loops).
9. [ ] **Verify `BASE_URL=https://crads-ai.com`** (no trailing slash, no `samdavis.ai` lingering).
10. [ ] **Confirm `.env*` files are not in `git status`** before any commit during cutover. Run `git check-ignore -v .env` to verify.
11. [ ] **Stripe Radar rules** — enable default fraud protection at minimum; consider CVC + ZIP checks required.
12. [ ] **Monitor first 24h** — Vercel function logs + Stripe Dashboard + Resend dashboard + Cal dashboard. Have a rollback plan: flip `STRIPE_SECRET_KEY` back to test and disable live webhook endpoint.
13. [ ] **Document the manual recovery path** for "webhook refund failed" alerts (MEDIUM-6) — Sam needs a runbook before live mode, not after the first failure.
14. [ ] **Test the idempotency window** (MEDIUM-3) — confirm 100 bookings is a comfortable margin for current volume; if not, add KV-backed idempotency before live.
