# Account Booking Hub — design spec

**Date:** 2026-06-16
**Status:** approved (A1, v1 scope)
**Branch:** `feat/account-booking-hub`
**Author:** Sam + Idris

## Problem

The logged-in account today is a one-way **coaching-journey funnel** (onboarding stepper → S1→S4 state machine → packs → read-only session list). It is not a place a client can *book from*. A returning client who wants to pay for another Coaching Block has no in-account path to do it — the exact failure Samantha hit on 2026-06-15. Sam wants the account to be a **persistent self-serve booking hub**.

## Current state (verified 2026-06-16)

- **Persistence is durable.** Users/tokens/cohorts/throttle live in **Redis** (`ioredis` + `REDIS_URL`); sessions are 60-day signed-JWT cookies; bookings live in Cal.com; payments/subscriptions in Stripe. Nothing is stored in-memory or in a file. If `REDIS_URL` were unset, `ioredis` would fail against localhost and prod login would already be broken — so working prod logins imply Redis is configured.
- **Booking→account linkage already works.** Public flow: `/book/<sku>` → `/api/checkout` → Stripe → `/api/stripe/webhook` → `createOrUpdateUser`, which **matches by email** and appends to `user.engagements[]`. An in-account booking made with the account's own email therefore auto-links.
- **Bookable-via-slot SKUs are only `single-session` and `coaching-block`.** `group-block` (cohort, pre-blocked) and `continuation-retainer` (subscription, scheduled out-of-band) skip Cal slot-booking (`NO_CAL_SKUS` in `api/checkout.js`).
- **Cal v2 bookings carry a stable `uid`** (+ `rescheduledFromUid`), so reschedule/cancel can target a specific booking.

## Goals

1. A logged-in client can **book / rebook** a Single Session or Coaching Block from inside the account (identity pre-filled), reusing the existing checkout→webhook pipeline.
2. A logged-in client can **reschedule** an upcoming session.
3. A logged-in client can **cancel** an upcoming session, with the 24h policy shown.
4. Verify persistence is rock-solid as a foundation step (Sam's "Both").
5. Reframe the dashboard from "funnel progress" to "your hub".

## Non-goals (YAGNI — explicitly out of scope for v1)

Session notes / recordings; CSV export; email-change/account-merge; audit log; soft-delete/pause; **in-house Stripe refund automation**; local bookings/payments cache; multi-SKU state-machine decoupling. (All are on the explorer's gap list; none are needed to make the account a working booking hub.)

## Foundation — Step 0 (must land before features)

**F0.1 — Fix the Cal status-case bug.** `lib/calBookings.js` filters `b.status === 'ACCEPTED'` (uppercase) in two places (`fetchNextSession`, `fetchUpcomingAndPast`). The live Cal v2 API (`cal-api-version: 2024-08-13`) returns **lowercase `"accepted"`**. Result today: every upcoming booking is filtered out — the account's "Upcoming" and the dashboard "next session" show nothing even when bookings exist. Fix: compare case-insensitively (`String(b.status).toLowerCase() === 'accepted'`). Add a unit test with a lowercase-status future-booking fixture asserting it appears in `upcoming`.

**F0.2 — Verify persistence end-to-end.** Confirm (a) prod login persists across sessions (implies Redis OK), (b) the webhook appends engagements by email, (c) after F0.1, a real upcoming booking renders in `/account/sessions`. Deliverable: a short written verdict; Sam confirms by logging into his own/a test account and seeing the 19-Jun booking surface. No code beyond F0.1 unless a gap is found.

## Feature 1 — In-account booking ("Book another session")

- **New endpoint** `api/account/book.js` (GET), `requireAuth`, rendered in the account shell. Add `vercel.json` rewrite `/account/book` → `/api/account/book`.
- Renders the two slot-based SKUs (**Single $250**, **Coaching Block $1,000**) each with the existing slot picker; renders Group (→ `/group` register-interest) and Retainer (→ checkout, subscription mode) as simple CTA buttons. Prices read from the same source the public pages use; no duplicate price literals where avoidable.
- **Identity injection:** reuse `book/_slot-picker.js`. Add an optional hook: when `window.BOOK_IDENTITY = { name, email }` is set, the picker pre-fills and **locks** the name/email fields (hidden/disabled) and POSTs those values. Account email is locked = the webhook links the purchase to *this* account.
- Same `/api/checkout` → Stripe → webhook pipeline. **No new payment code.**
- Add a prominent **"Book another session →"** CTA on the dashboard (`api/account/index.js`) and the sessions page (`api/account/sessions.js`).

## Features 2 & 3 — Reschedule / Cancel (v1 = Cal-hosted)

- In `api/account/sessions.js`, each **upcoming** booking renders **Reschedule** and **Cancel** controls built from its `uid`, opening **Cal's native hosted flow** in a new tab. Cal enforces its own min-notice and **emails Sam (the host) natively** on reschedule/cancel — so no custom notify endpoint is needed in v1.
- Inline **24h policy** copy next to the controls: >24h notice = full refund or free reschedule; inside 24h = no refund, one reschedule offered.
- **No Stripe refund automation in v1.** The rare refund-eligible case (a standalone Single cancelled >24h) is handled manually by Sam; the policy copy sets that expectation. (In-house cancel-with-refund is the documented v2 upgrade.)
- Only the authenticated owner's own bookings are rendered (fetched via `fetchBookings(user.email)`), so only their `uid`s are ever exposed.

## Data model

No schema change for v1. `user.engagements[]` already grows on the webhook. Bookings remain sourced live from Cal.

## Error handling

- Cal API failure on the sessions/dashboard path already degrades gracefully (`.catch(() => ({ upcoming: [], past: [] }))`); keep that, but surface a small "couldn't load your sessions, refresh or email Sam" note instead of silently empty.
- Checkout errors reuse the slot-picker's existing error box.

## Testing

- Unit: F0.1 status-case fix (lowercase fixture → upcoming non-empty).
- Render: `api/account/book` lists the bookable SKUs and injects identity globals.
- Manual: log in as a test account → book a Single → see it in Upcoming → open Reschedule + Cancel links.

## Open items to verify during build

1. Exact Cal-hosted reschedule/cancel URL format for a `uid` (fallback: Cal v2 API `POST /v2/bookings/{uid}/cancel` + `/reschedule`).
2. `_slot-picker.js` identity-injection hook behaves (pre-fill + lock, still POSTs account email).
3. Retainer CTA from the account triggers a clean subscription checkout; Group CTA routes to register-interest.

## Rollout

Single feature branch `feat/account-booking-hub` off `main`; ship via PR (matching repo convention). F0.1 can ship first as its own small commit since it's an independent bug fix.
