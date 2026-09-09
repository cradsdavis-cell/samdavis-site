# crads-ai.com

The home of Crads-AI: a free, open-source, self-hosted AI assistant that runs on a server you own. The site is the product's front door, its manual and its download page, plus the two paid ways to get Sam's time (guided setup, working session).

## What is served

| URL | What | Source |
|---|---|---|
| `/` | Front door | `index.html` |
| `/download` | Windows / Mac binaries (302s to the GitHub release; sizes read from the release) | `api/download.js`, `lib/downloadPage.js`, `lib/releaseAssets.js` |
| `/docs`, `/docs/<slug>` | The product manual | **Generated in the app repo**, never edited here (see below) |
| `/how-it-works` | What it is made of and how it gets built | `how-it-works/index.html` |
| `/offer` | Setup and support (the two paid SKUs) | `offer/index.html` |
| `/about` | Who built it | `about/index.html` |
| `/book`, `/book/discovery`, `/book/guided-setup`, `/book/working-session` | Booking pages (Cal slot picker, Stripe Checkout for the paid two) | `book/*.html`, `book/_slot-picker.js` |
| `/thanks`, `/booking-failed`, `/404` | Utility pages | root |

Unlisted, kept for existing coaching clients and the owner's cockpit: the account portal (`/account/*`, `api/account/*`), the admin API (`api/admin/*`), the Stripe webhook, the Cal proxies. `tests/coachingUnlisted.test.js` pins that these exist and stay gated; nothing links to them from the public site. `api/wc-tasks.js` is a Trello fetcher for the samdavis-trackers dashboard, which still calls it.

## Hosting

Vercel: static files plus serverless functions in `api/`. `cleanUrls` on, no trailing slashes. Push to `main` deploys production; every other branch gets a preview URL. Redirects for retired pages live in `vercel.json` (retire = redirect, never a 404 for a link someone holds).

`scripts/served.js` is the one definition of what Vercel serves (it applies `.vercelignore`). `archive/`, `scripts/`, `tests/`, `brand/`, `scratchpad/` are never served.

## The docs

`/docs` is published from the app repo (`ai-os`, `docs/product/pipeline/publish.mjs`, run with `SITE=` pointing at this checkout). Each page is self-contained (own sidebar, search index, prev/next). To change a docs page, change its source there and republish. `publish.mjs` copies only the screenshots the pages reference into `docs/shots/`.

## Nav

`lib/site.js` owns `NAV_ITEMS`. `navHTML()` renders it and `initNavInject()` swaps it into any static `<nav class="site-nav-bar">` on page load, so the generated docs pages carry the current nav too. Site-owned pages keep a byte-identical static copy as the no-JS fallback: after changing `NAV_ITEMS`, run

```bash
npm run nav
```

`tests/navConsistency.test.js` fails if a static copy drifts or a page carries two navs.

## Sitemap

`sitemap.xml` is generated from the served HTML set (`scripts/build-sitemap.mjs`). After adding or retiring a page:

```bash
npm run sitemap
```

`tests/sitemap.test.js` fails until it is regenerated.

## Tests

```bash
npm test
```

`node --test tests/*.test.js`; eslint runs inside the suite as a bug net (no style rules). The tests that guard the public surface: `deadLinks` (every site-relative link resolves; redirects never chain), `navConsistency`, `sitemap`, `noBakServed` (no `.bak`/`.pem`/`.md` served), `download`, `coachingUnlisted`, and the Stripe/Cal plumbing tests (`checkout`, `webhook`, `book`, `sessionBalance`).

## Offer and money (v4, 2026-09-09)

The software is free. Two SKUs are purchasable (`lib/skus.js`):

- **Guided setup, A$700.** Two 1-hour Cal sessions at least a day apart. Session 1 is booked at Stripe Checkout; session 2 from `/account/book`, which refuses a slot inside 24h of session 1.
- **Working session, A$350.** 90 minutes, booked at checkout.

Retired that day and never purchasable again: the Coaching Block (4 × 90), Single Session, Continuation Retainer (subscription), pay-in-4, Group Block, EA Basic Build. Their Cal event types survive in `LEGACY_SKU_DEFS` so a client mid-engagement can still book from the portal.

Live Stripe price IDs are in `lib/skus.js` (they are not secrets); `STRIPE_PRICE_GUIDED_SETUP` / `STRIPE_PRICE_WORKING_SESSION` override them if set.

## Env vars (Vercel Production)

Auth and portal: `SESSION_SECRET` (32+ chars), `REDIS_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (redirect URI `https://crads-ai.com/api/auth/google/callback`), `CRON_SECRET` / `CRON_SECRET_2` (admin API bearer).

Money and booking: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CAL_API_KEY`, `CAL_EVENT_TYPE_DISCOVERY` (30 min, free), `CAL_EVENT_TYPE_SINGLE` (90 min, working session), `CAL_EVENT_TYPE_GUIDED_SETUP` (60 min, guided setup), `CAL_EVENT_TYPE_BLOCK` (legacy portal bookings only), `BASE_URL`.

Changing env vars requires a redeploy.

## Deploy gate

Before merging to `main`: `npm test` green; open the branch preview on desktop and mobile and check one nav, the Download pill, the v4 prices only, no Sign in; `curl -sI` every redirect source in `vercel.json` (308 + a 200 destination); `/download/windows` and `/download/mac` 302 to assets that answer 200; a smoke booking through `/book/working-session` with a 100% coupon, then delete the Cal booking and the coupon. After deploy, watch the Vercel runtime logs for 500s on `/api/checkout`, `/api/stripe/webhook` and `/api/download`.

## Marketing screenshots

`scripts/audit-shots.mjs` shoots the marketing pages desktop + mobile into `scratchpad/shots/` for eyeballing (`/download` is a function, so point it at a preview URL with `BASE=`).

## History

`archive/README.md` lists what was retired when and why. The hosted-era control plane, the app account system and the coaching ladder are all in there.
