---
phase: boutique-redesign
reviewed: 2026-05-18T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - index.html
  - overview/index.html
  - offer/index.html
  - onepager/index.html
  - build/index.html
  - build-onepager/index.html
  - book/_styles.css
  - book/index.html
  - book/coaching-block.html
  - book/discovery.html
  - book/ea-basic-build.html
  - book/single-session.html
  - book/_slot-picker.js
  - lib/site.css
  - lib/site.js
  - thanks.html
  - thanks.js
  - booking-failed.html
findings:
  critical: 0
  warning: 13
  info: 17
  total: 30
status: issues_found
---

# Boutique Redesign — Code Review Report

**Reviewed:** 2026-05-18
**Depth:** deep
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The redesign ships in good shape: production-critical Stripe + Cal integration in `book/_slot-picker.js` and `thanks.js` is sound (defensive payload normalisation, idempotency-friendly polling with bounded attempts + error budget, race-loss redirect to `/booking-failed`). No critical bugs or security holes detected. The shared `lib/site.css` palette is internally consistent and the `lib/site.js` motion utilities degrade gracefully under `prefers-reduced-motion`.

The findings cluster around three themes:

1. **CSS-variable drift in `book/_styles.css`** — the `:root` block redefines `--ink` and `--paper` (palette tokens that don't exist in the shared system), then the shared `lib/site.css` is imported AFTER no — actually the book CSS is imported AFTER `lib/site.css` in every book page, so book's `:root` overrides do NOT clobber the shared palette. However, `book/_styles.css` *uses* `--ink` and `--paper` (legacy names) in several rules while the shared system uses `--ink-deep` and `--bg-main`. That's not broken because book's own `:root` defines those legacy aliases, but it's drift that violates the "all CSS variables drawn from the shared palette" convention named in the review prompt.

2. **Per-page inline `<style>` blocks duplicate the shared nav** — `onepager/index.html`, `build/index.html`, `build-onepager/index.html`, and `book/_styles.css` each contain a full `.site-nav-bar` ruleset (~25 lines) that should live in `lib/site.css`. Same for `book/_styles.css`. ~100 lines of duplicated nav CSS across 4 files.

3. **Accessibility gaps** — `--ink-faint` (#998D6B on #FAF7EE) computes to ~3.20:1 contrast ratio, **failing WCAG AA 4.5:1** for body text. Used in `.hero-proof`, `.site-footer .location`, `.kicker`, `.bg-line` captions, footer chrome on slide deck, and `.site-nav-bar .sep` separators. Several pages also have empty `alt=""` on the brand-mark illustration where decorative-image semantics apply correctly, but the hero illustration on the landing page has alt text describing what the AVIF shows — good. Form labels in `_slot-picker.js` are correctly associated. Mobile nav on landing wraps but doesn't have a hamburger.

Plus a scattering of inconsistencies (favicon order varies across pages, meta-description missing on some, two distinct nav structures — flex-spread `nav-links` on landing/overview/offer vs centered pill nav on onepager/build/build-onepager/book/*).

Performance issues are out of scope for v1, but flagged below as info where I noticed obvious dupes (e.g. duplicated nav CSS, duplicated Google Fonts import — once via `lib/site.css` `@import`, once via explicit `<link>` on `thanks.html`).

---

## Warnings

### WR-01: `book/_styles.css` defines legacy palette aliases (`--ink`, `--paper`) that drift from shared system

**File:** `book/_styles.css:3-7`
**Issue:** The `:root` block redefines `--ink: #1f1d1a;` and `--paper: #fafaee;` — neither token exists in `lib/site.css`'s palette. Shared system uses `--ink-deep: #3E3418` and `--bg-main: #FAF7EE`. The legacy values are visually close but NOT identical (`#1f1d1a` is darker and less warm than `#3E3418`; `#fafaee` vs `#FAF7EE` differs in the last hex pair). Book pages will render in slightly-off brand colour vs the rest of the site. Worse: any rule in `book/_styles.css` that uses `var(--ink)` (lines 12, 40) produces text that doesn't match `lib/site.css`'s `--ink-deep`.
**Fix:**
```css
/* book/_styles.css — replace lines 3-7 entirely */
:root {
  --accent-soft: rgba(143, 117, 48, 0.08);
}
```
And replace `var(--ink)` → `var(--ink-deep)`, `var(--paper)` → `var(--bg-main)` everywhere in book/_styles.css. Same correction for `.site-nav-bar a.current { color: var(--ink); }` (line 40) — should be `var(--ink-deep)`.

### WR-02: `--ink-faint` (#998D6B on #FAF7EE) fails WCAG AA 4.5:1 contrast for body text

**File:** `lib/site.css:13` (token); used across many surfaces
**Issue:** Contrast ratio is ~3.20:1. AA requires 4.5:1 for normal-size body text. This token is used as foreground for:
- `index.html:37` `.hero-proof` (15px body text — fails)
- `lib/site.css:276` `.site-footer .location` (13.5px italic — fails harder)
- `build/index.html:111` `.kicker` (14px — fails)
- `onepager/index.html:53` `header.top .meta` (10px — fails)
- `build/index.html:32, 42` footer chrome counter + brand (12-13px — fails)
- `lib/site.css:118` `.meta` utility class (13px — fails)

3:1 is acceptable for large-text (>=18px regular, >=14px bold) — only a couple of uses qualify. Most body uses fail.
**Fix:** Either darken the token (`--ink-faint: #7A6E50` raises ratio to ~4.6:1, preserves brand feel) or restrict its use to large/decorative text only and swap body uses to `--ink-soft` (#6B5F3A computes ~5.4:1, passes AA).

### WR-03: Two divergent nav structures across the site — branded flex-layout vs centered-pill

**File:** all pages
**Issue:** Founder-side flow has two visually different nav components:
- **Landing/Overview/Offer** (`index.html:71`, `overview/index.html:36`, `offer/index.html:39`) — flex-spread bar with brand image + wordmark on left, nav links on right (per `lib/site.css:193`).
- **Onepager/Build/Build-onepager/Book/* + Thanks/Booking-failed** — centered pill at top, no brand image, just text links separated by `<span class="sep">·</span>`.

Reviewer spec says "nav structure should be identical on all founder-side pages." It is not. The pill style is defined four times (once in each of onepager/build/build-onepager + `book/_styles.css`) with identical 25-line CSS blocks.

Additionally, the nav-link list is inconsistent in copy: landing-tier pages have `Offer` (matches the page title); pill-tier pages have `For founders` (legacy label). Same destination URL, different labels — confusing for screen-reader users navigating between pages.
**Fix:** Pick one nav pattern and consolidate. Either:
- (a) Move pill nav into `lib/site.css` as `.site-nav-bar.pill` modifier; replace flex-spread nav on landing/overview/offer; delete inline blocks from onepager/build/build-onepager + the `.site-nav-bar` block from `book/_styles.css`.
- (b) Move flex-spread nav into the pill pages; delete pill blocks.

Then normalise the link label (`Offer` everywhere or `For founders` everywhere — recommend `Offer` since that's what the page title says).

### WR-04: Footer inconsistency between page tiers

**File:** all pages
**Issue:** Spec says footer should be identical 5 lines (wordmark, email, linkedin, phone, location). Actual state:
- **Landing/Overview/Offer:** full `.site-footer` with all 5 lines.
- **Onepager:** `footer.bot` with only `cradsdavis@gmail.com · linkedin · phone` on left + "AEST until September 2026, UK after." on right. No wordmark line, no Coogee/Sydney location, dates don't match Wellington-locked Jan 2027 move.
- **Build/Build-onepager:** same as Onepager — `footer.bot` (the same one for build/), plus build/index.html has the date issue.
- **Book/Book SKU pages/Thanks/Booking-failed:** no footer at all.

**Fix:** Add `<footer class="site-footer">` (matching landing-tier 5-line block) to `book/index.html`, `book/coaching-block.html`, `book/discovery.html`, `book/ea-basic-build.html`, `book/single-session.html`, `thanks.html`, `booking-failed.html`. Replace `footer.bot` in onepager/build/build-onepager with the same 5-line block (drop the cute right-align date string, which is now wrong anyway).

### WR-05: Date claims are stale — "September 2026, UK after" and "Moving to the UK late 2026"

**File:** `onepager/index.html:502` + `build-onepager/index.html:596` + `build/index.html:703`
**Issue:** Per current state of Layer 6 (Wellington offer accepted 2026-05-16, Jan 2027 start LOCKED), the UK move is Jan 2027, not "September 2026" / "late 2026". Onepager + build-onepager footers say `AEST until September 2026, UK after.` Build presentation slide 11 (final CTA) says `Moving to the UK late 2026.` Both inaccurate. Build-onepager describes "AEST until September 2026" in `.bg-line` framing.

This is a public-facing factual error that a prospective client could check against Sam's LinkedIn or be confused by during a Discovery call.
**Fix:** Update to `AEST until December 2026, UK from January 2027.` Or drop the date footer entirely — the location line ("Coogee, Sydney.") carries enough.

### WR-06: Onepager nav uses `For founders` label but file is `/offer/` — label-vs-URL drift

**File:** `onepager/index.html:378`, `build/index.html:435`, `build-onepager/index.html:433`, `book/index.html:18`, all book SKU pages
**Issue:** Nav link text is `For founders` but destination is `/offer`. Landing/overview/offer pages use the label `Offer` for the same destination. Same target, different label depending on which page the user is on. Inconsistent + creates the false impression of two destinations.
**Fix:** Normalise to `Offer` everywhere (matches the page's actual title and `current` highlight on `/offer`).

### WR-07: `onepager/index.html` brand identifier is "AI coach & systems builder" — drift from elsewhere

**File:** `onepager/index.html:388`
**Issue:** Header byline reads `AI coach & systems builder`, but build/build-onepager headers + chrome read `PhD data scientist · AI builder`, and the landing hero eyebrow reads `SAM DAVIS · PhD ENVIRONMENTAL DATA SCIENCE · 8 AI BUILDS IN 12 MONTHS`. The auto-memory `feedback_stay_within_ability_level` + the project-context note about the public-positioning reframe (drop "AI systems builder" as leading framing; lead with "facilitation + impact + founder-talent") suggest this is now stale. AI coach reads softer than the other surfaces.

Less load-bearing now that the Wellington Jan 2027 acceptance reframes "long-run positioning" to "handover positioning" (per `short-term-income/README.md` 2026-05-17 reframe note), but inconsistency between the four bylines is real.
**Fix:** Pick one byline shape and apply across all 6 founder-side pages. Recommended (after the 2026-05-17 reframe): `PhD data scientist · AI builder · facilitator` or simply `PhD data scientist · AI builder`.

### WR-08: Missing `<meta name="description">` on several pages

**File:** `onepager/index.html`, `book/coaching-block.html`, `book/discovery.html`, `book/ea-basic-build.html`, `book/single-session.html`, `thanks.html`, `booking-failed.html`
**Issue:** Spec says meta descriptions should exist on every page. Present on: `index.html` (line 7), `overview/index.html` (line 7), `offer/index.html` (line 7), `build/index.html` (line 10), `build-onepager/index.html` (line 10), `book/index.html` (line 8). Missing on the others.

Book SKU pages especially should have descriptions because they're the pages most likely to be deep-linked from outbound emails to prospective clients (Sam's Alex Mills booking link is to `https://crads-ai.com/book/coaching-block`). Without a description, social previews and search snippets use first text on page, which is whatever copy renders.
**Fix:** Add `<meta name="description" content="...">` to each missing page. Suggestions:
- `book/coaching-block.html`: "Book a 4-session Coaching Block with Sam Davis — $500 AUD, build your AI executive assistant alongside Sam over a few weeks."
- `book/discovery.html`: "Book a free 30-minute Discovery call with Sam Davis — scope whether an AI executive assistant build fits your shape."
- `book/ea-basic-build.html`: "Book the EA Basic Build with Sam Davis — $2,000 AUD, one-week sprint, full AI executive assistant install on your stack."
- `book/single-session.html`: "Book a single 60-minute coaching session with Sam Davis — $150 AUD, one specific pain point, one working piece."

### WR-09: `book/_styles.css` is loaded by `thanks.html` and `booking-failed.html` but `lib/site.css` is not

**File:** `thanks.html:11`, `booking-failed.html:8`
**Issue:** Both pages load `book/_styles.css` but skip `lib/site.css`. `book/_styles.css` `:root` only defines `--ink`, `--paper`, `--accent-soft`. It references `var(--rule)`, `var(--sans)`, `var(--ink-soft)`, `var(--accent)`, `var(--ink-faint)` — none of which it defines. They come from the shared system, which isn't loaded.

`thanks.html` partially compensates by loading Inter directly via Google Fonts (lines 8-10), but `--sans`, `--rule`, `--accent`, etc. are still undefined → fall back to CSS initial values → unstyled text, no border colours, no accent colour. The page won't crash but will look broken vs the rest of the site.

Same issue, worse on `booking-failed.html` — no font preconnect either, so Inter doesn't load.
**Fix:** Add `<link rel="stylesheet" href="/lib/site.css">` BEFORE `<link rel="stylesheet" href="/book/_styles.css">` in both files. Remove duplicate Google Fonts preconnect from `thanks.html` (already imported via lib/site.css `@import`).

### WR-10: `lib/site.css` `@import url(...)` for Google Fonts is render-blocking and slow

**File:** `lib/site.css:6`
**Issue:** The `@import url('https://fonts.googleapis.com/css2?family=Inter...')` at top of `lib/site.css` is render-blocking. Browsers can't start parsing the rest of the CSS until the imported sheet returns, and they can't preconnect to `fonts.googleapis.com` before they discover the import. This adds ~200-400ms to first-paint, particularly on mobile.

Marginal because the site is small and Inter is widely cached, but the fix is one line.
**Fix:** Move font loading to `<link>` tags in each page's `<head>` BEFORE `<link rel="stylesheet" href="/lib/site.css">`. Better: add a single `<link rel="preconnect">` + `<link rel="stylesheet">` set in a shared snippet, and delete the `@import` from `lib/site.css`. Alternatively, host Inter + Playfair locally (~80KB woff2 total) which removes the third-party DNS lookup entirely.

### WR-11: Slot picker re-renders entire `innerHTML` on every load — fragile if user is mid-interaction

**File:** `book/_slot-picker.js:19, 30, 60, 82`
**Issue:** `loadSlots()` writes `<div class="slot-loading">…</div>` to `root.innerHTML`, then on success replaces the whole tree (`root.innerHTML = html` at line 82). If a user has clicked a slot button and started filling the form, then `loadSlots()` is called again (e.g. via window-focus refresh — not currently wired but easy to add), their selection and partial form input vanish silently.

Not a current bug since `loadSlots()` is only called once on page-load, but worth flagging as the call site is a re-render-blast-radius.

Also: the `slot-loading` div is never explicitly removed before the success render — `innerHTML = html` clobbers it, which is fine, but coupling these two rendering paths via shared mutable state on `root` is the kind of pattern that bites on future iteration.
**Fix:** Either explicitly document the single-call contract with a comment, or refactor to two child containers (`#slot-list` for the grid, `#slot-form-mount` for the form) so re-fetching slots doesn't blow away an in-progress form. Lower priority while no auto-refresh is wired up.

### WR-12: `book/_slot-picker.js` does not handle `null` or non-array `slots[date]` defensively

**File:** `book/_slot-picker.js:42-46, 50-54`
**Issue:** Lines 42-46 iterate `for (const s of slots)` where `slots` is `raw[date]` from `Object.entries(raw)`. If the API ever returns `{"2026-05-20": null}` (Cal v2 has been known to return null arrays on quota errors), `for...of null` throws `TypeError: slots is not iterable`. This blasts to the catch in `loadSlots()` which is fine, but the user sees `Couldn't load slots: slots is not iterable.` — not actionable.

Same on line 50-54 inside the `raw.data` shape handling.
**Fix:**
```js
for (const [date, slots] of Object.entries(raw)) {
  if (!Array.isArray(slots)) continue;
  for (const s of slots) out.push({ time: s.time || s, date });
}
```
Apply same guard to the `raw.data` branch.

### WR-13: `book/_slot-picker.js` line 67 — `iso.slice(0, 10)` assumes ISO format starts with `YYYY-MM-DD`, but normaliseSlots may produce raw strings

**File:** `book/_slot-picker.js:65-69`
**Issue:** When Cal returns `{ "2026-05-20": [{ time: "2026-05-20T13:00:00Z" }] }`, the `normaliseSlots()` output items look like `{ time: "2026-05-20T13:00:00Z", date: "2026-05-20" }`. `renderSlots()` then does `const iso = s.time;` and `const dayKey = iso.slice(0, 10);` — fine.

But the defensive branch (`for (const s of slots) out.push({ time: s.time || s, date });`) handles the case where `s` is itself a plain string. In that case `s.time` is undefined, so `s.time || s` returns the string `s`. If `s` is a time-only string like `"13:00"` (a shape this code is defending against), then `iso.slice(0, 10) === "13:00"` and `new Date("13:00T12:00:00")` is `Invalid Date`, so `fmtDay` returns `"Invalid Date"` in the UI.

This is a defensive-branch-of-a-defensive-branch — only triggered if Cal returns time-only strings. The bigger code-quality smell is that the defensive branch silently hides a bad-shape error as a "Invalid Date" label rather than rejecting it.
**Fix:**
```js
for (const s of slots) {
  const time = typeof s === 'string' ? s : s.time;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(time)) continue;
  out.push({ time, date });
}
```

---

## Info

### IN-01: Per-page inline `<style>` blocks duplicate ~25 lines of nav CSS in 4 files

**File:** `onepager/index.html:341-368`, `build/index.html:401-425`, `build-onepager/index.html:396-422`, `book/_styles.css:21-45`
**Issue:** The pill-nav `.site-nav-bar` ruleset appears verbatim (with one-character differences) in four files. ~100 LOC total duplication. Risk: changing the nav style requires four edits.
**Fix:** Move pill-nav style into `lib/site.css` (as `.site-nav-bar.pill` modifier or as the default — see WR-03). Strip from per-page styles.

### IN-02: Inline `<style>` on landing page hero would benefit from extraction to lib/site.css

**File:** `index.html:12-67`
**Issue:** `.hero`, `.hero-illustration`, `.hero-copy`, `.hero-ctas`, `.hero-proof`, `.work-entry`, `.work-closing` all defined inline. Most are landing-specific so this is reasonable. Worth flagging that the `.hero-proof` color `var(--ink-faint)` uses the failing-contrast token (cross-ref WR-02).
**Fix:** Optional. Leave inline if these classes are landing-only. Address WR-02 separately.

### IN-03: `overview/index.html` line 82 has a TODO comment in production HTML

**File:** `overview/index.html:82`
**Issue:** `<!-- TODO when Abbey permission lands: testimonial card here -->` — harmless but leaks internal state. Anyone viewing source sees that a specific testimonial is pending and the named person.
**Fix:** Remove the TODO. Track the work in Todoist or wiki, not in the live HTML.

### IN-04: Favicon link order is inconsistent across pages

**File:** all pages
**Issue:** Landing + overview + offer order: `<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">` then `<link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">`.
Onepager + build + build-onepager + book/* order: `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` THEN `<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">` — SVG first.
Thanks + booking-failed order: just the SVG.
**Fix:** Pick one favicon strategy. SVG-first is modern best practice (vector scaling). Recommend: `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` then `<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">` then `<link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">` (browsers walk the list, falling back). Apply to all pages.

### IN-05: `nav` lacks `aria-label` and `Skip to content` link

**File:** all pages
**Issue:** No `aria-label="Primary"` on `<nav>`; no skip-link for keyboard users. Not a violation per se since `<nav>` has implicit landmark role, but adding `aria-label` makes the landmark named in screen-reader nav lists ("Primary navigation"). Skip-link enables keyboard users to bypass the nav on every page.
**Fix:**
```html
<a href="#main" class="skip-link">Skip to content</a>
<nav class="site-nav-bar" aria-label="Primary">…</nav>
…
<main id="main">…</main>
```
With CSS:
```css
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 16px; top: 16px; background: var(--accent); color: var(--bg-main); padding: 8px 14px; z-index: 9999; }
```

### IN-06: `<main>` element missing on book/* and thanks/booking-failed

**File:** `book/index.html`, all book SKU pages, `thanks.html`, `booking-failed.html`
**Issue:** No `<main>` landmark — content lives in `<div class="book-container">`. Screen readers can't jump to main content. Landing/overview/offer/build pages have `<main>`, so this is inconsistent too.
**Fix:** Replace `<div class="book-container">` with `<main class="book-container">`.

### IN-07: `<a>` tags with `target="_blank"` use `rel="noopener"` but not `rel="noreferrer"`

**File:** `index.html:122, 145`, `overview/index.html:126`, `offer/index.html:106`
**Issue:** `target="_blank" rel="noopener"` prevents the opened page from accessing `window.opener` (security best practice — present). Adding `noreferrer` also prevents the Referer header leak. Standard convention is `rel="noopener noreferrer"`.
**Fix:** `rel="noopener noreferrer"` everywhere. Marginal — modern browsers default to implicit noopener for `target="_blank"`.

### IN-08: `<img>` brand illustration in nav has empty `alt=""` (correct for decorative) but no fallback for missing image

**File:** `index.html:73`, `overview/index.html:38`, `offer/index.html:41`
**Issue:** `<img src="/lib/img/sam-illustration-sm.png" alt="">` is correct semantic (decorative — the wordmark adjacent provides the brand name). But if the image 404s, nothing renders and the click-target shrinks to the wordmark width. Low priority but worth a `width` + `height` to prevent layout shift.
**Fix:** Add `width="36" height="36"` to match the `lib/site.css:208` sized rule. Prevents CLS during font/image load.

### IN-09: `index.html` line 87 hero illustration has well-written alt text describing decoration, but `srcset` lacks `<picture>` for art direction

**File:** `index.html:87`
**Issue:** Hero img is responsive via `srcset` + `sizes`. Mobile shows `sam-illustration-sm.png` at 320w, desktop shows `sam-illustration.png` at 480w. Fine for resolution switching; if Sam ever wants a portrait-vs-landscape art-direction change, `<picture>` would be needed.

Alt text on line 87 reads `"Sam Davis — illustration of a person holding a small tech-and-leaves icon"` — good (describes content, names subject). On lines 38 + 51 + 54 the same illustration carries `alt=""` decoratively — defensible because the hero version is the meaningful one.
**Fix:** Nothing actionable. Flagged for completeness.

### IN-10: Brand-mark "AI coach & systems builder" on onepager uses `&amp;` while build pages use `&amp;` consistently — OK, but `--`/em-dash usage is inconsistent

**File:** `onepager/index.html:388`, `build/index.html:442`, `build-onepager/index.html:443`
**Issue:** Stylistic. Cross-page consistency check — all three use `&amp;`. Onepager byline: `AI coach &amp; systems builder`. Build: `PhD data scientist · AI builder`. Build-onepager: `PhD data scientist · AI builder · new to fractional B2B`. The "new to fractional B2B" line is unique to build-onepager and may be load-bearing for the print artefact (honest-positioning move). Cross-ref WR-07 (byline drift).
**Fix:** Decide whether `new to fractional B2B` should also appear in `build/index.html` chrome (currently absent — slide 4 covers it instead).

### IN-11: `<title>` on book pages is terse — could include the price

**File:** `book/coaching-block.html:7`, `book/single-session.html:7`, `book/ea-basic-build.html:7`
**Issue:** `<title>Coaching Block — Sam Davis</title>`. When this tab is one of 30 in a browser, "Coaching Block" alone isn't very disambiguating. Adding the price helps recall ("Coaching Block · $500 — Sam Davis").
**Fix:** Optional. Polish nit.

### IN-12: `book/_slot-picker.js` line 30 — error message interpolates `err.message` directly into innerHTML

**File:** `book/_slot-picker.js:30, 150`
**Issue:** `root.innerHTML = '<div class="slot-error">Couldn\'t load slots: ' + err.message + '...'` interpolates an `Error.message` into HTML. `err.message` for a `fetch` error is typically `"HTTP 500"` or `"Failed to fetch"` — safe. But if the API ever throws an error whose message contains `<script>` (unlikely from `fetch` itself, possible from a future change), this would be an XSS vector. Defensive practice is to use `textContent` for error messages.
**Fix:**
```js
} catch (err) {
  root.innerHTML = '<div class="slot-error"></div>';
  root.firstChild.textContent = `Couldn't load slots: ${err.message}. Refresh or email cradsdavis@gmail.com.`;
}
```
Same pattern at line 150 (`errBox.textContent` IS used there — good, just flagging line 30 + the inconsistency).

### IN-13: `thanks.js` line 50 uses `innerHTML` to render error with `<a>` link

**File:** `thanks.js:50, 57`
**Issue:** Both error branches use `subhead.innerHTML = "...<a href='mailto:...'>...</a>..."`. The strings are static literals so no injection risk. Worth noting that `.innerHTML` here is for the convenience of embedding a mailto link, which is fine. The pattern is consistent with `book/_slot-picker.js` and the static strings make it safe. No action needed; flagging for awareness.
**Fix:** None required.

### IN-14: Slide deck navigation in `build/index.html` is keyboard-only with no on-screen prev/next buttons

**File:** `build/index.html:709, 730-742`
**Issue:** The footer hint reads `← → navigate · 1–9 jump · P print`. Touch users on a phone have no way to advance slides — no swipe handler, no on-screen ← → buttons. Cross-ref the media query at line 396-400 which only sizes elements, doesn't add touch controls.

Also: when slides ≥ 10 (and there are 11), the "1–9 jump" hint is incomplete; slide 10 + 11 are unreachable by number key (`else if (e.key >= '1' && e.key <= '9')` on line 738).
**Fix:** Add swipe-left/swipe-right handlers OR floating ← → buttons in `header.chrome` for touch users. Update hint copy to reflect "11 slides".

Also fix: `document.getElementById('total').textContent = slides.length;` correctly shows 11 at runtime, but the footer hard-codes `<span id="total">10</span>` (line 710 displays 10 by default before JS runs). With 11 slides actually rendered, "1 / 10" briefly shown before JS swaps to "1 / 11" is jarring. Either set initial text to "" or to the correct count.

### IN-15: `lib/site.js` `initSmoothScroll` modifies URL via `history.pushState` — could clutter back-button history

**File:** `lib/site.js:77`
**Issue:** Each click on `#work` or `#how` etc. pushes a history entry. Users who scroll through several sections via anchor links and then hit Back land on the previous in-page anchor, not the previous page. Defensible UX choice for some sites; for a marketing site usually `history.replaceState` is preferred so Back goes to the previous origin.
**Fix:** Consider `history.replaceState(null, '', '#' + id);` — but this is a UX preference, not a bug.

### IN-16: `book/_slot-picker.js` `loadSlots()` 21-day window — hardcoded magic number

**File:** `book/_slot-picker.js:22`
**Issue:** `const end = new Date(now.getTime() + 21 * 86400000).toISOString();` — 21-day booking window is a business decision baked into a calculation. Future change ("show 4 weeks") requires a code edit.
**Fix:** Extract `const BOOKING_WINDOW_DAYS = 21;` at module top. Documented + greppable.

### IN-17: `book/_styles.css:77` hover state hard-codes `#6B5624` instead of using `var(--accent-deep)`

**File:** `book/_styles.css:77`
**Issue:** `.book-cta:hover { background: #6B5624; }` — `#6B5624` IS `var(--accent-deep)`. Use the token.
**Fix:** `.book-cta:hover { background: var(--accent-deep); }`. Same applies to `book/_styles.css:115` `color: #b00020` (error red) — should be tokenised as `--error` in `lib/site.css` if errors recur elsewhere.

---

_Reviewed: 2026-05-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
