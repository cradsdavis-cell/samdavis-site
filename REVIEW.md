# samdavis-site code review — 2026-05-18

Reviewed: `api/*`, `lib/*`, `book/_slot-picker.js`, `thanks.js`, HTML pages, `tests/*`, `vercel.json`, `package.json`. Findings ordered by severity. Each item is file:line + concrete fix.

---

## CRITICAL

### C1. `findBookingByStripeSession` idempotency window is not safe against historical collisions
`lib/cal.js:48-53`. `take=100` fetches the most-recent 100 bookings. The known-concern doc notes "fine at single-digit bookings/week," but the **idempotency window also depends on Stripe retry timing**, not just booking volume. A successful `checkout.session.completed` will Stripe-retry up to 3 days, so if booking #100 was made >3d ago the dedupe still works — but a **Stripe payment intent processed days after creation** (delayed_payment_methods / SCA bank holds) combined with intervening volume will silently re-create the Cal booking and double-charge the calendar slot.

Fix: stash the `cal_booking_id` on the Stripe `PaymentIntent` (`stripe.paymentIntents.update(pi, {metadata:{cal_booking_id}})`) inside the webhook *after* booking success. Then idempotency check becomes `retrieve PI → check metadata.cal_booking_id` — O(1) and unbounded retention. Falls back to current scan only if PI metadata is empty.

### C2. Stripe webhook 500 path causes silent double-booking on Cal recovery
`api/stripe/webhook.js:91-95`. When Cal returns a non-409 5xx and the handler 500s, Stripe retries. On the retry, if Cal is back up *and* the previous attempt actually created a booking server-side (Cal succeeded, network failed before response), the dedupe at line 44-48 catches it — **but only if `findBookingByStripeSession` returns it**. That helper depends on the booking being in the top-100 by `sortCreated=desc`, which is true at low volume but the failure case here is Cal-was-down → retry-storm → many of Sam's bookings written in a short window → the dedupe scan still works at volume 100. Compounds with C1.

Fix per C1 — PI metadata is the authoritative idempotency key. Belt-and-braces: store `idempotency_key: stripeSessionId` on the Cal createBooking call (`calFetch` headers via Cal's `Idempotency-Key` header if supported, otherwise as `metadata.idempotency_key`).

### C3. `customer_email` may be null on the Stripe Checkout session
`api/stripe/webhook.js:40, 55`. `customer_email` is set explicitly in `createCheckoutSession` (`lib/stripe.js:16`) but Stripe **strips it** on session if the customer has an existing `customer` record with a different email, or if they used "remember me" Link autofill. When null, `createBooking` is called with `email: null` → Cal v2 rejects with a validation error → falls into the catch-all 500 branch → Stripe retries → Sam pays Stripe fees for a session whose booking will never succeed. Also: race-loss email goes to `null` → Resend throws → caught by line 79-85 (Sam alerted but customer never told).

Fix: at line 41, `const email = customer_email || session.customer_details?.email;` (Stripe always populates `customer_details.email` for checkout sessions). Validate non-null before calling `createBooking`; if missing, log + alert Sam + 200 (don't retry — payment landed, manual recovery).

### C4. Race-loss refund is not idempotent — Stripe will retry the entire webhook on Cal 5xx
`api/stripe/webhook.js:66-88`. If `refundSession` succeeds but `sendRaceLossEmail` throws (Resend down), the catch at line 79 sends Sam an "URGENT" alert. But the response is **still 200** at line 86, so Stripe doesn't retry — and the customer never receives the race-loss email. Worse: if `refundSession` itself fails (already refunded, payment intent in invalid state), the alert fires but the **customer is unrefunded and uninformed**, and again no Stripe retry.

Fix: split the refund and email steps. Wrap refund alone in try; on success, attempt email + alert separately and never let email failure mask refund success. Track refund status server-side (e.g. update PaymentIntent metadata `refund_attempted: true`) so a manual replay won't double-refund. Also emit a distinct response code so the webhook handler can be replayed safely.

---

## HIGH

### H1. No input validation on email/name shape; `slot_iso` not validated
`api/checkout.js:11-14`. Only presence is checked. A malicious or buggy client can send `email: "not-an-email"`, `slot_iso: "yesterday"`, or `name: "<script>...</script>"`. Stripe will accept any string for `customer_email` (it's not validated by Stripe at session creation), and the value flows into `lib/email.js:13` (`to: customer_email`) → Resend may bounce silently. `slot_iso` flows into `metadata.slot_iso` and is later passed straight to Cal's `start` field — Cal will reject malformed ISO, but only at booking time (after payment).

Fix: regex-validate `slot_iso` (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.\d]+)?(Z|[+-]\d{2}:?\d{2})$/`), basic email regex, trim+cap `name` length (e.g. 100 chars). Reject 400 before reaching Stripe. Also: validate `slot_iso` is in the future and within the 21-day window the slot picker shows — otherwise users can replay an old POST with a stale slot.

### H2. Cal availability endpoint has no rate-limit protection and no caching
`api/cal/availability.js`. The endpoint takes arbitrary `startDate`/`endDate` and proxies straight to Cal with the server-side key. A bot scraping `/api/cal/availability?sku=x&startDate=...&endDate=...` can burn Cal API quota and rate-limit Sam's real customers (Cal v2 has per-account RPM limits). No `Cache-Control` header on the response, no startDate/endDate sanity bounds.

Fix: clamp `endDate - startDate` to ≤ 31 days, reject historical dates, add `Cache-Control: public, max-age=60` on success (slots change but not by-the-second), and add a basic in-memory token bucket keyed by IP via `req.headers['x-forwarded-for']`.

### H3. Stripe API version drift risk
`lib/stripe.js:7`. Pinned to `'2024-09-30.acacia'`. The SDK is `^14.0.0` (caret-range). When Stripe ships a major SDK version that drops support for this API pin, `npm install` on a fresh Vercel deploy will fail at runtime, not build time (no type check on `apiVersion`). Webhook construction may silently accept events for a different API version than the SDK validates against.

Fix: pin Stripe SDK exactly (`"stripe": "14.x"` minimum, ideally `"stripe": "~14"`). Add a smoke test that constructs a `Stripe()` instance in CI to catch incompatible versions at build.

### H4. `parseInt(cal_event_type_id, 10)` returns NaN on missing metadata — Cal call silently malforms
`api/stripe/webhook.js:52`. Known-concern #3 covers "defensive check for missing `metadata.cal_event_type_id`"; my material addition is that `parseInt(undefined, 10)` returns `NaN`, which serializes to JSON `null`, which Cal v2's `/bookings` will reject with a 400 — and that flows into the **non-409 5xx branch** at line 91, returning 500 to Stripe, triggering up to 3 days of retries that will never succeed. Sam's alerts inbox gets spammed.

Fix at line 41: `if (!cal_event_type_id || isNaN(parseInt(cal_event_type_id, 10)))` → alert Sam + 200 (acknowledge so Stripe stops retrying; manual recovery). Same for missing `slot_iso`, `sku`, `name`.

### H5. `findBookingByStripeSession` status check too narrow; double-confirms refunded bookings
`api/booking-status.js:13-14`. `confirmed = bookings.length > 0` — but a booking that was created then later cancelled by Sam (or by the race-loss refund path) still has `length > 0`, and the `refunded` regex only matches statuses containing "cancelled" or "refunded" literally. Cal v2 uses `status: 'CANCELLED'` (uppercase), `'REJECTED'`, `'PENDING'`, `'ACCEPTED'`, `'AWAITING_HOST'`. The regex catches CANCELLED (case-insensitive) but misses REJECTED. A rejected booking will surface as `confirmed:true, refunded:false` to the `/thanks` page, telling the customer the booking succeeded when it didn't.

Fix at line 13: `const confirmed = bookings.some(b => /accepted|awaiting_host/i.test(b.status || ''));`. Or invert: only `confirmed:true` if status is explicitly in an accepted set.

### H6. Webhook reads `req.rawBody` before checking it's a Buffer
`api/stripe/webhook.js:11-19`. Vercel sometimes pre-parses bodies even with `bodyParser: false` if a previous middleware touched the stream. `req.rawBody` may be a string, not a Buffer; `constructWebhookEvent` will throw an unhelpful error caught at line 29 as "invalid_signature". Sam will think Stripe webhook secret is wrong; real cause is body-parsing.

Fix: at line 12, `if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);`

### H7. Free Discovery path: no idempotency, no slot validation
`api/checkout.js:18-31`. Anyone can POST `/api/checkout?free=1` with `sku: 'discovery'` and any `slot_iso`/`email`/`name`. No CAPTCHA, no rate limit, no email confirmation. A bot can flood Sam's calendar with bogus Discovery bookings. Also: the synthetic `stripeSessionId = "free_discovery_${Date.now()}"` is per-request unique, so a double-click on the form creates two bookings for the same slot (Cal will reject the second with 409, but the response is currently `502 cal_booking_failed` — confusing UX).

Fix: rate-limit per-IP (5/hour for free bookings), add a honeypot field to the form, and on 409 from Cal, render a friendly "slot just got taken" message instead of 502.

---

## MEDIUM

### M1. `take=100` is hardcoded; no protection against Cal pagination behavior changes
`lib/cal.js:48`. Cal v2 may cap `take` (current docs say max 250). If Cal lowers it to 50, the dedupe scan silently truncates. Add `const MAX_DEDUPE_SCAN = 100;` constant with a one-line comment about Cal's documented limit.

### M2. Test infrastructure leaks module-cache state across test files
`tests/webhook.test.js:7-24`, `tests/checkout.test.js:11-15`, `tests/booking-status.test.js:6-8`. Each file mutates `require.cache` globally. Running `node --test tests/*.test.js` works only because Node `--test` isolates files into worker processes by default — but **not all platforms do**. Vitest with this layout would silently cross-contaminate. The known-concern doc covers parallel execution; my addition: the `checkout.test.js` at line 60-67 re-mutates `require.cache` mid-file and re-requires the handler, meaning **tests before line 67 use one stub, tests after use another**. This works coincidentally — the test at line 69 expects the cal stub — but the test at line 47 ("unknown SKU") would pass with either stub set, hiding accidents.

Fix: rewrite tests to use `node:test`'s `mock.module()` (Node 22.1+) or `proxyquire`. Until then, document the file order dependency in a top-of-file comment.

### M3. Magic numbers and timezones hardcoded
`lib/cal.js:22, 38` (`'Australia/Sydney'`), `book/_slot-picker.js:22` (`21 * 86400000`), `thanks.js:24` (`maxAttempts = 15`). All belong in a config module or env vars. Sam moves to UK in Jan 2027; timezone needs to flip. Slot window may need adjustment per SKU (Discovery 14 days, EA Build 30 days).

Fix: `lib/config.js` with `BOOKING_WINDOW_DAYS = 21`, `DEFAULT_TIMEZONE = 'Australia/Sydney'`, `THANKS_POLL_ATTEMPTS = 15`. Per-SKU window overrides in `skus.js`.

### M4. `lib/email.js` from-address is hardcoded; broken when subdomain DNS isn't verified yet
`lib/email.js:13, 31`. `hello@crads-ai.com` and `alerts@crads-ai.com` both assume Resend domain verification is complete. On the live-mode flip, if `crads-ai.com` isn't fully verified, Resend returns 422 and the email is silently dropped (return value not checked at the callsite in `webhook.js:69-78`). Customer never gets race-loss email; Sam never knows.

Fix: check the Resend response (`if (result.error) throw new Error(result.error.message)`) so failures bubble into the alerter. Move from-address to `FROM_EMAIL` / `ALERT_FROM_EMAIL` env vars.

### M5. `book/_slot-picker.js` constructs HTML by string concatenation with user data
`book/_slot-picker.js:30, 61, 77`. The `err.message` on line 30 is interpolated into HTML without escaping. Today this is safe (errors come from `fetch`), but a future change that injects user-controlled strings into errors creates an XSS path. Same for line 77's `iso` — currently always an ISO timestamp from Cal, but defense-in-depth says escape on output.

Fix: add `escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({...}[c])); }` and apply to every dynamic interpolation, or migrate to `textContent` + DOM construction for error messages.

### M6. `thanks.js` polls forever past `maxAttempts` on network errors
`thanks.js:41`. Empty catch swallows the error; `setTimeout(poll, 2000)` is only called if the catch is reached AND `attempts < maxAttempts`. Re-reading: the `setTimeout` at line 47 is **outside** the try/catch, fires on every iteration that doesn't `return` early, and the attempt-count check at line 42 fires only after the catch — actually correct, but very subtle. The bug is on a successful fetch that returns `{confirmed: false, refunded: false}` (booking still pending after webhook delay): `poll()` falls through without `return`, hits `attempts >= maxAttempts` check, then `setTimeout`. That works. **Subtle issue:** if `res.json()` throws (non-JSON 502 from Vercel), the catch fires, and message-to-Sam never tells the user *why* polling timed out — they just see "Still processing…".

Fix: increment a `consecutiveErrors` counter in the catch; if `>= 3`, surface "Network error" in the UI sooner.

### M7. `lib/skus.js` `parseInt` runs at module-import time; missing env vars yield NaN silently
`lib/skus.js:7, 13, 21`. If `CAL_EVENT_TYPE_SINGLE` is unset at cold-start, `cal_event_type_id` becomes `NaN`, flows through `createCheckoutSession` metadata as `"NaN"` string, gets re-parsed in `webhook.js:52` as `NaN` → C4 path.

Fix: lazy-evaluate (like `DISCOVERY_EVENT_TYPE_ID()`) and throw at use-time with a clear "Missing CAL_EVENT_TYPE_SINGLE env var" message.

### M8. No CORS headers; no method validation beyond OPTIONS
Every API handler returns 405 for non-target methods but doesn't handle OPTIONS. If the booking form ever moves to a different origin (e.g. embedded in Sam's substack), CORS preflight fails silently.

Fix: add `if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '...'); res.status(204).end(); return; }`.

---

## LOW

### L1. `vercel.json` rewrite is a no-op
`vercel.json:4`. `{"source":"/api/:path*","destination":"/api/:path*"}` rewrites a path to itself. Vercel already routes `/api/*` to serverless functions by convention. Either remove the rule or make it do something (e.g. lock methods).

### L2. `package.json` missing lock file commit guard / lacks `"type":"module"` clarity
Pure CommonJS throughout but no explicit `"type": "commonjs"`. When Node 24 default changes (unlikely soon), behavior shifts. Add `"type": "commonjs"`.

### L3. `thanks.html:7` references `/book/_styles.css` even on the thanks page
Works but couples the styles file to the booking subdir. If `/book/` ever moves, `/thanks` breaks. Consider `/styles.css` at root.

### L4. `lib/email.js:18` includes hardcoded "first day this booking system is live"
Will read stale within 7 days. Make it generic or strip.

### L5. `book/_slot-picker.js:24-25` URL building uses encodeURIComponent on ISO strings — fine but verbose
`encodeURIComponent('2026-05-20T15:00:00+10:00')` is needed (the `+` is otherwise interpreted as space). Good. But `start = now.toISOString()` always returns `...Z` (UTC), and Cal's response is interpreted in `Australia/Sydney`. Possible off-by-12-hour edge cases at day boundaries. Worth a comment.

### L6. No telemetry / structured logging
All `res.status(500).json(...)` calls go to Vercel's stdout log. No request ID propagation through to Cal/Stripe calls. At v1 fine; flag for future observability.

### L7. `api/checkout.js:9` JSON parse path is fragile
`typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})`. If `req.body` is a Buffer (Vercel sometimes returns Buffer for non-JSON content-types), neither branch handles it. Add `Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString())` branch.

---

## Test coverage gaps (informational)

1. No test for `customer_email: null` webhook payload (C3).
2. No test for missing `metadata.cal_event_type_id` (H4 / known-concern #3).
3. No test for `findBookingByStripeSession` actually filtering metadata correctly — `tests/booking-status.test.js` stubs the whole function, hiding the take=100 + client-side filter logic that was the load-bearing 421f3dc fix. Add a `tests/cal.test.js` covering the filter against a fake `calFetch`.
4. No test for race-loss refund-failure branch (covered by known-concern #2).
5. No test for free Discovery duplicate POST (H7).
6. No integration test for the slot-picker's `normaliseSlots` against actual Cal v2 response shapes (would have caught the b7db694 + db6455a + e1a2163 series).

---

*Reviewed: 2026-05-18*
*Depth: standard*
