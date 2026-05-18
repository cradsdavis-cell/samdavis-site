# crads-ai.com — 6-Pillar UI Audit

**Audited:** 2026-05-18 (source-only, no Playwright)
**Scope:** 11 live pages, branch `feat/payment-gated-booking`
**Context:** Sam is sending `/book/coaching-block` to Alex Mills today after this audit.

---

## Severity legend

- **BLOCK** — fix before Alex's link goes out. Customer-impacting or trust-eroding.
- **FLAG** — fix this week. Polish, consistency, smaller a11y gaps.
- **PASS** — acceptable for v1.

---

## Top 3 BLOCKers (fix before sending Alex the link)

1. **Stale `samdavis-site` URLs + Calendly links on 5 pages.** Site rebranded to crads-ai.com today, but `/onepager` (lines 489, 493, 497, 501, 508, 513), `/build-onepager` (lines 583, 587, 591, 595, 602, 607), `/overview` (lines 945, 956), `/offer` (line 972), `/build` (line 718) still link to the old `cradsdavis-cell.github.io/samdavis-site/*` URLs and `calendly.com/cradsdavis/30min` — bypassing the new payment-gated booking flow entirely. Alex won't see the new flow; worse, he sees a "Sam Davis" brand pointing at *another* domain. Sam ships in 4-5 hours.
2. **Pricing contradiction on EA Basic Build between `/offer` and `/book/ea-basic-build`.** `/offer` slide 5 (line 787) + slide 10 "How you pay" (line 948) both say *"50% at booking · 50% at handover"*. `/book/ea-basic-build` (line 20) says *"$2,000 AUD · pay on booking"*. Customer who reads both pages will not trust the booking page.
3. **Onepager + build-onepager unreadable on mobile.** Both pages are A4-sized (`width: 210mm`, no viewport meta tag) with no responsive layout. The homepage `📄 One-pager` button takes phone users to a horizontally-scrolling print artefact. Add `<meta name="viewport">` + a mobile breakpoint that swaps `width: 210mm` for `width: 100%` under 768px, or hide the onepager links from mobile.

---

## Pillar 1 — Visual hierarchy

- **PASS** — Eyebrow → h1 → lede → cards is consistent across landing, overview, offer, build. Serif h1/h2 + mono eyebrow + sans body is a coherent system.
- **FLAG** — `/book` 4-card grid has no visual emphasis on the most-likely choice. All 4 cards are equal weight. Coaching Block is Sam's bread-and-butter SKU + the one Alex bought. Promote with `--accent-bright` background + ★ marker (mirror the `rung-hero` treatment from `/offer` line 707 + `/onepager` line 468).
- **FLAG** — `/thanks` initial state ("Confirming your booking…") has no spinner or motion. Polling fires silently for up to 30 s. Customer just paid $500 and sees a static line. Add a CSS pulse on the h1 or a 3-dot loader.

## Pillar 2 — Typography

- **PASS** — Gold/cream pages use Playfair Display + Inter + ui-monospace consistently. Excellent serif/sans rhythm.
- **FLAG** — Book pages declare `font-family: 'Clear Sans', system-ui` (`book/_styles.css:10`) but the font isn't loaded — there's no `@import` or `<link>` for Clear Sans. Every book page silently falls back to `system-ui`, which renders as Segoe UI on Windows and SF on Mac. Visually inconsistent with the rest of the site (which is Inter). Fix: change to `font-family: 'Inter', system-ui, ...` and add the Google Fonts `<link>` from index.html, OR self-host Clear Sans.
- **FLAG** — `/onepager` body copy at `font-size: 12px` and rung body at `10px` is too small even for a print A4 — readable on print but cramped on screen.

## Pillar 3 — Color & contrast

- **FLAG** — Brand inconsistency: gold/cream landing + onepagers vs. blue book/offer flows. The two-palette decision is justified for narrative pages vs. transactional pages, but the brand split is jarring on first navigation: Alex clicks "Book →" from homepage and the entire palette flips with no continuity. Fix (minimal): keep blue book pages but add a thin gold `--accent`-colored top bar (4px) on book pages so the gold brand thread carries through.
- **FLAG** — `/book/_styles.css` `.book-card .meta` color `var(--ink-soft)` (#4a463f) on `#fff` background at `0.95rem` — passes WCAG AA (8.6:1), good. But `.book-card .for` at same color/size is borderline scannable; bump to `--ink` for body copy.
- **PASS** — Gold `--accent: #8F7530` on cream `--bg: #FAF7EE` passes AA (4.83:1) for normal text. Blue `--accent: #0E5484` on white passes AAA (8.36:1).
- **FLAG** — Slot-button `:hover` only changes border color; no `:focus-visible` style. Keyboard users can't see where they are. Add `.slot-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.

## Pillar 4 — Spacing & alignment

- **PASS** — `book-grid` uses `repeat(auto-fit, minmax(280px, 1fr))` — responsive without explicit breakpoints, will flow cleanly from 4-col → 2-col → 1-col.
- **FLAG** — `.book-container` `padding: 5rem 2rem 3rem` — the 5rem top leaves the floating nav-bar overlapping into the `h1` zone at narrow viewports. The nav is 44px tall; 5rem (80px) is fine on desktop, tight on small screens where the nav wraps. Confirmed: nav has `white-space: nowrap` so it won't wrap, but at <380px the nav will overflow horizontally before the breakpoint at 760px fires.
- **FLAG** — Slot-grid `minmax(140px, 1fr)` is fine on desktop but at 375px viewport — `140 + 16px container padding * 2` — only 1 column fits comfortably; you get 2 cramped 140px cards with no gap room. Lower to `minmax(110px, 1fr)` for mobile-friendly density, or split into mobile/desktop grids.

## Pillar 5 — Accessibility

- **FLAG** — Slot-picker form (`_slot-picker.js:90-91`) has bare `<label>Your name</label><input>` — labels are siblings, not associated. Screen readers won't connect them. Fix: `<label for="name">Your name</label><input id="name" name="name" required>`.
- **FLAG** — `<input type="text" name="name">` has no `autocomplete="name"`, email no `autocomplete="email"`. Mobile keyboards won't auto-fill.
- **FLAG** — Slot buttons (`_slot-picker.js:77`) lack `aria-pressed` state when `.selected`. Add `aria-pressed="false|true"` and toggle alongside the class.
- **FLAG** — No skip-to-content link. Nav-bar is `position: fixed` — keyboard users tab through 5 nav links on every page before reaching content.
- **PASS** — Semantic HTML is decent: `<nav>`, `<main>`, `<section>`, `<h1>` per page. Print media queries hide nav cleanly.
- **FLAG** — `/thanks` polling shows no live-region announcement when state flips from "Confirming…" to "Booking confirmed." Screen reader users won't know it changed. Add `aria-live="polite"` to the header container.
- **FLAG** — All linkable cards on landing (`a.card`) and book menu (`a.book-cta`) have decent target size but the homepage `.onepager-link` "📄 One-pager" is `font-size: 12px` with 5px×12px padding — well under the WCAG 2.5.5 minimum 44×44 target.

## Pillar 6 — Mobile responsiveness

- **BLOCK (#3 above)** — `/onepager` and `/build-onepager` have no viewport meta and A4 fixed widths.
- **PASS** — Landing, overview, offer, build, book menu all have viewport meta + responsive grids at 760px and 960px breakpoints.
- **FLAG** — Site nav `white-space: nowrap` with 5 links + 4 separators at `font-size: 11.5px` on mobile — measures ~310px wide. Fits 375px iPhone SE but overflows on small Android (320px). Either reduce to icon-set under 380px, or set `flex-wrap: wrap` + recenter.
- **FLAG** — `/build` slide deck `main.stage { padding: 56px 24px; }` at narrow screens; the slides themselves use `transform: scale(--fit)` for desktop fit — at mobile this kicks in oddly and content may render very small. Test the keyboard-nav deck on mobile (or hide deck-specific UI and switch to a scroll layout under 760px).

---

## Other concerns called out in the brief

- **Brand coherence ("Sam Davis" vs crads-ai.com domain):** Currently split. Every page says "Sam Davis · AI coach & systems builder" with no "crads-ai" anywhere on-page. First-time visitor at `crads-ai.com` lands on a page about "Sam Davis" — slight cognitive friction. Add a sub-line in the chrome header (`Sam Davis · crads-ai.com`) or treat the domain as pure URL and accept the asymmetry.
- **Hero copy clarity in <5 sec:** PASS for the founder audience ("An AI executive assistant *with a real brain.*" + lede). The two-card "For founders / For businesses" routes the visitor explicitly. Strong.
- **Stripe Checkout (out of our control):** Test-mode banner + AI-agent disclosure are Stripe-rendered. Note: customers see "TEST MODE" in red until you swap to live keys — verify `STRIPE_SECRET_KEY` is live before Alex pays $500.
- **/booking-failed page:** Recovery copy is good — names the cause ("Slot got taken"), states the refund timing (5-10 business days), offers manual fallback (email Sam). Tone is human, not corporate. PASS. Minor FLAG: the apology "Sorry about that. First day this booking system is live" — remove "first day" line once you've had Alex through; otherwise sounds amateur if it persists in week 4.

---

## Files audited

`index.html`, `book/index.html`, `book/discovery.html`, `book/single-session.html`, `book/coaching-block.html`, `book/ea-basic-build.html`, `book/_styles.css`, `book/_slot-picker.js`, `thanks.html`, `thanks.js`, `booking-failed.html`, `overview/index.html`, `onepager/index.html`, `offer/index.html`, `build/index.html`, `build-onepager/index.html`.

---

## Concrete fixes (paste-ready)

### Fix BLOCK #1 — sweep URLs (run before Alex sends)

```bash
# in c:/tmp/samdavis-site
# replace all stale samdavis-site URLs with crads-ai.com
grep -rln 'cradsdavis-cell.github.io/samdavis-site' --include='*.html' | \
  xargs sed -i 's|cradsdavis-cell.github.io/samdavis-site|crads-ai.com|g'

# decide on Calendly vs /book/discovery — likely swap to /book/discovery
grep -rln 'calendly.com/cradsdavis/30min' --include='*.html' | \
  xargs sed -i 's|https://calendly.com/cradsdavis/30min|https://crads-ai.com/book/discovery|g'
```

### Fix BLOCK #2 — reconcile pricing

Pick one: either update `/book/ea-basic-build` to support 50/50 split (matches `/offer`), or update `/offer` lines 787 + 948 to say *"$2,000 paid on booking"*. The `decisions/log.md` 2026-05-17 entry says "payment-in-full supersedes 50/50 split" — so update `/offer`.

### Fix BLOCK #3 — viewport on onepagers

Add to both `onepager/index.html` and `build-onepager/index.html` `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

And inside `@media (max-width: 760px)` block:

```css
.page { width: 100%; min-height: auto; padding: 6mm 5mm; }
.what-grid, .ladder, .demos, .layer-strip { grid-template-columns: 1fr 1fr; gap: 6px; }
@media (max-width: 480px) { .what-grid, .ladder, .demos, .layer-strip { grid-template-columns: 1fr; } }
```

### Fix FLAG — slot-picker label association + a11y

In `book/_slot-picker.js:90-91`:

```js
<div class="field"><label for="bk-name">Your name</label><input id="bk-name" type="text" name="name" autocomplete="name" required></div>
<div class="field"><label for="bk-email">Email</label><input id="bk-email" type="email" name="email" autocomplete="email" required></div>
```

In `book/_styles.css`, add:

```css
.slot-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.book-cta:focus-visible { outline: 2px solid var(--accent-bright, var(--accent)); outline-offset: 3px; }
```

In `_slot-picker.js:77` add `aria-pressed`:

```js
html += `<button class="slot-button" data-iso="${iso}" aria-pressed="false">${fmtTime(iso)}</button>`;
// and on selection:
btn.setAttribute('aria-pressed', 'true');
document.querySelectorAll('.slot-button').forEach(b => b !== btn && b.setAttribute('aria-pressed', 'false'));
```

### Fix FLAG — Clear Sans font missing

In `book/_styles.css:10`, change:

```css
--sans: 'Inter', system-ui, -apple-system, sans-serif;
```

And add to each book HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Fix FLAG — /thanks loading state

In `thanks.html` add inline:

```css
#header { display: inline-block; }
#header::after { content: ''; display: inline-block; width: 1em; animation: dots 1.4s infinite; }
@keyframes dots { 0%,20% { content:''; } 40% { content:'.'; } 60% { content:'..'; } 80%,100% { content:'...'; } }
```

And add `aria-live="polite"` to the `<div class="book-header">`.

### Fix FLAG — promote Coaching Block on /book

In `book/index.html`, add `book-card-hero` class to the Coaching Block card:

```css
.book-card-hero { border: 2px solid var(--accent); box-shadow: 0 4px 12px rgba(14,84,132,0.12); position: relative; }
.book-card-hero::before { content: '★ Most popular'; position: absolute; top: -10px; left: 16px; background: var(--accent); color: #fff; font-size: 0.75rem; padding: 2px 10px; border-radius: 4px; }
```
