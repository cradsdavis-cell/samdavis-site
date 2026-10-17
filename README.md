# crads-ai.com

The home of Crads-AI: a free, open-source, self-hosted AI assistant that runs on a server you own. The site is the product's front door, its manual and its download page, plus the two paid ways to get Sam's time (walkthrough, guided setup).

## What is served

| URL | What | Source |
|---|---|---|
| `/` | Front door | `index.html` |
| `/download` | Windows / Mac binaries (302s to the GitHub release; sizes read from the release) | `api/download.js`, `lib/downloadPage.js`, `lib/releaseAssets.js` |
| `/docs`, `/docs/<slug>` | The product manual | **Generated in the app repo**, never edited here (see below) |
| `/how-it-works` | What it is made of and how it gets built | `how-it-works/index.html` |
| `/offer` | Setup and support (the two paid SKUs) | `offer/index.html` |
| `/about` | Who built it | `about/index.html` |
| `/book`, `/book/discovery`, `/book/walkthrough`, `/book/guided-setup` | Booking pages (Cal slot picker, Stripe Checkout for the paid two) | `book/*.html`, `book/_slot-picker.js` |
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

## Offer and money (v5, 2026-09-11)

The software is free. Two SKUs are purchasable (`lib/skus.js`), both two sessions at least a day apart. Session 1 is booked at Stripe Checkout; session 2 from `/account/book`, which refuses a slot inside 24h of session 1. The two sessions of a SKU have different lengths, so each SKU carries one Cal event type per session (`sessions: [{label, duration_min, cal_event_env, cal_event_default}]`), and `/api/cal/availability` takes `session=N`.

- **Walkthrough, A$350.** Session 1 60 min (how to use Claude Code and the app; the client installs both and creates their mineral beforehand), the onboarding interview as homework, session 2 30 min (what it learned, the CRIT method, one real problem).
- **Guided setup, A$700.** Session 1 60 min (same, plus building the server in the client's own hosting account), the interview, session 2 120 min (email, calendar, Slack or WhatsApp connected; first skills; the morning brief and a first scheduled job).

Both include written docs and 30 days of Slack support. The assistant always lives on a small server in the client's own hosting account (local mode, "On this computer", was retired from the offer and the copy on 2026-10-13). After 30 days, extra time is A$233 an hour on request: not a SKU.

Retired 2026-09-11: the Working session (90 min, A$350). Its Stripe price is reused as the walkthrough price (the Stripe product is still named "Working session"; renaming it is a Stripe-side chore, not a code change). Retired 2026-09-09 and never purchasable again: the Coaching Block (4 × 90), Single Session, Continuation Retainer (subscription), pay-in-4, Group Block, EA Basic Build. Their Cal event types survive in `LEGACY_SKU_DEFS` (env only, no default) so a client mid-engagement can still book from the portal.

Live Stripe price IDs and the four Cal event type IDs are in `lib/skus.js` (neither is a secret); `STRIPE_PRICE_WALKTHROUGH` / `STRIPE_PRICE_GUIDED_SETUP` and `CAL_EVENT_TYPE_WALKTHROUGH_S1` / `_S2`, `CAL_EVENT_TYPE_GUIDED_SETUP_S1` / `_S2` override them if set.

## Where bookings come from

Three records, each answering a different question. Read them together; none is complete alone.

| Record | What it says | Where to read it |
|---|---|---|
| Vercel Web Analytics | Page views and the two conversion clicks (`Book click`, `Download click`), broken down by referrer and by `utm_source`. Cookieless; disclosed in the privacy policy, "Visiting crads-ai.com". | Vercel dashboard, project `crads-ai`, Analytics (or the Vercel MCP `aggregate_pageviews` / `aggregate_events`, `by: ["utmSource"]`). Production only. |
| `heard_from` | What the booker says: the optional "How did you hear about this?" dropdown on the Stripe Checkout page, next to "Who sent you?". | Stripe (the session's custom fields) and the Cal booking metadata. |
| `utm_source` | What the link says: the tag on the booking page address they booked from. | Stripe session metadata and the Cal booking metadata. |

Code: `lib/attribution.js` (the dropdown, its eight answers, the tag cleaner), `book/_slot-picker.js` (reads the tag from the page address only, stores nothing in the browser), `api/checkout.js` and `api/stripe/webhook.js` (carry both to Cal). Partner referrals are separate (`/r/<slug>`, `lib/referrals.js`).

### Link tags

Every link to the site that Sam shares carries `utm_source`, so a booking can be traced to the place the link was posted. Point it at the booking page where the post is asking for a booking, since that page is the one whose tag reaches Stripe and Cal.

| Where the link goes | `utm_source` | Example |
|---|---|---|
| LinkedIn post or its first comment | `linkedin` | `https://crads-ai.com/book/roadmap?utm_source=linkedin&utm_medium=post` |
| LinkedIn DM | `linkedin` (`utm_medium=dm`) | `https://crads-ai.com/book/roadmap?utm_source=linkedin&utm_medium=dm` |
| Cold email (impact practitioners) | `email-cold` | `https://crads-ai.com/book/roadmap?code=PAINKILLER26&utm_source=email-cold` |
| Job-ad email ("before you hire") | `email-jobad` | `https://crads-ai.com/book/roadmap?code=PAINKILLER26&utm_source=email-jobad` |
| The weekly letter | `newsletter` | `https://crads-ai.com/writing/<essay>?utm_source=newsletter&utm_campaign=no-2` |
| Impact Collab Slack or community posts | `impactcollab` | `https://crads-ai.com/book/roadmap?utm_source=impactcollab` |
| WhatsApp groups | `whatsapp` | `https://crads-ai.com/book/roadmap?utm_source=whatsapp` |
| Other community hosts and groups | `community` (`utm_campaign=<group>`) | `https://crads-ai.com/book/roadmap?utm_source=community&utm_campaign=co-day` |
| Talks and events (slides, QR codes) | `event` (`utm_campaign=<event>`) | `https://crads-ai.com/book/roadmap?utm_source=event&utm_campaign=secna-summit` |

Rules:

- Lowercase, letters, digits and dashes. The site cuts `utm_source` to 40 characters and drops anything else.
- `utm_source` is the one that matters. `utm_medium` and `utm_campaign` are optional detail, and only Web Analytics reads them.
- Never put a person's name, email or company in a tag. Page addresses are recorded by Web Analytics, so a tag is public in effect.
- A partner's link stays `/r/<slug>`; don't add `utm_source` to it.
- The tag survives only on the page it lands on. A visitor who arrives at `/` with a tag and then clicks through to `/book/roadmap` books with no `utm_source` (the site keeps nothing in the browser to carry it). Their visit is still counted by tag in Web Analytics, and the dropdown still asks.

## Env vars (Vercel Production)

Auth and portal: `SESSION_SECRET` (32+ chars), `REDIS_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (redirect URI `https://crads-ai.com/api/auth/google/callback`), `CRON_SECRET` / `CRON_SECRET_2` (admin API bearer).

Money and booking: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CAL_API_KEY`, `CAL_EVENT_TYPE_DISCOVERY` (30 min, free), `CAL_EVENT_TYPE_WALKTHROUGH_S1` / `_S2` and `CAL_EVENT_TYPE_GUIDED_SETUP_S1` / `_S2` (optional overrides; the v5 event type IDs are hard-coded in `lib/skus.js`: 60 + 30 and 60 + 120 min), `CAL_EVENT_TYPE_WORKING_SESSION`, `CAL_EVENT_TYPE_SINGLE` and `CAL_EVENT_TYPE_BLOCK` (legacy portal bookings only), `BASE_URL`.

Changing env vars requires a redeploy.

## Deploy gate

Before merging to `main`: `npm test` green; open the branch preview on desktop and mobile and check one nav, the Download pill, the v5 prices only (A$350, A$700, A$233 an hour), no Sign in; `curl -sI` every redirect source in `vercel.json` (308 + a 200 destination); `/download/windows` and `/download/mac` 302 to assets that answer 200; a smoke booking through `/book/walkthrough` with a 100% coupon, then delete the Cal booking and the coupon. After deploy, watch the Vercel runtime logs for 500s on `/api/checkout`, `/api/stripe/webhook` and `/api/download`.

## Marketing screenshots

`scripts/audit-shots.mjs` shoots the marketing pages desktop + mobile into `scratchpad/shots/` for eyeballing (`/download` is a function, so point it at a preview URL with `BASE=`).

## History

`archive/README.md` lists what was retired when and why. The hosted-era control plane, the app account system and the coaching ladder are all in there.
