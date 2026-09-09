# Prepaid portal booking + state-aware client portal

Built 2026-06-23 after a client (Samantha) hit three walls: signed in, found no way to book a
session; the only booking link looked like it would charge her again; and a recurring
wrong-week booking bug.

## What changed

- **Session balance** (`lib/sessionBalance.js`) — the missing primitive. Each engagement now
  carries `sessions_total` + `sessions_used`. `computeBalance(user)` returns
  `{ total, used, remaining, hasBlock, isRetainer, bookable, activeBlock }`. New purchases set
  these in `lib/createOrUpdateUser.js` (a block/single books its first session at checkout, so
  `sessions_used` starts at 1).
- **Authed booking** (`api/account/book.js`) — a signed-in client with `remaining > 0` (or an
  active retainer) books their next session here. It reuses the existing slot cache
  (`/api/cal/availability`) and the no-charge Cal booking primitive (`lib/cal.createBooking`,
  the same one the free discovery path uses) and **never touches Stripe**. Identity comes from
  the session cookie, never the request body. On success it decrements the block balance.
- **State-aware portal** — the home hero (`lib/journeyTracker.js`), home page
  (`api/account/index.js`), and Sessions page (`api/account/sessions.js`) now show what's next,
  sessions used/remaining, a one-click **Book** CTA, and a link to materials. "Book a session"
  is in the sidebar (`lib/account.js`).
- **Admin balance editor** (`api/account/admin/client.js` + `api/admin/set-balance.js`) — set a
  client's real per-engagement `used`/`total` (many sessions were booked by direct calendar
  invite, so the auto-count won't match), bump `total` to record a second block bought via a
  Stripe invoice, and set a per-client `drive_folder_url` for materials.

## Ops runbook

1. **Backfill existing clients:** `node scripts/backfill-session-balance.js` (dry run) then
   `--apply`. Stamps `sessions_total`/`sessions_used` onto legacy engagements. Needs `REDIS_URL`.
2. **Correct real balances:** for each active client, open `/account/admin/client?email=…` and
   set the true used/total. (E.g. Samantha's first block is completed; her second block is
   `used 1 / total 4` → 3 left to book.) If a client's second block was paid by Stripe invoice
   (not site checkout) it won't be in their record — add it by bumping a block's `total`.
3. **Backfilled clients with no welcome email:** clients seeded by CSV got no setup link (hence
   "forgot password"). Use **Resend welcome magic link** on their admin page to send a clean one.

## The wrong-week booking bug (Cal "tentative hold" → "busy")

Root cause: Sam used to put a tentative *hold* on a client's slot in Google Calendar before they
booked. Cal.com reads his GCal for conflicts and treats the hold as **busy**, so it dropped that
slot from availability and offered the client a later week — which they then booked.

The fix is operational, and this feature mostly removes the need for it:

- **Clients now self-book from live availability** — no pre-hold needed, so the trigger is gone.
- If Sam still wants to reserve time, the hold must be **Free**, not Busy (set the GCal event's
  availability to "Free"), or it should live on a calendar Cal.com doesn't read for conflicts.
- Cal still auto-refunds on a genuine slot collision in the paid path (`api/stripe/webhook.js`);
  the prepaid path returns a clean "pick another time" with nothing to refund.
