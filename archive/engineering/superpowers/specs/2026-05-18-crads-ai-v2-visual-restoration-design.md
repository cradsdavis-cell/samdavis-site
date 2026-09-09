# crads-ai.com v2 — Visual Restoration Design Spec

**Date:** 2026-05-18
**Branch (planned):** `feat/v2-visual-restoration-2026-05`
**Predecessor:** [`2026-05-18-crads-ai-boutique-redesign-design.md`](2026-05-18-crads-ai-boutique-redesign-design.md) (shipped as `redesign-v1` on 2026-05-18)
**Status:** Draft awaiting user approval

---

## Goal

Restore the structured visual richness lost when the v1 boutique redesign collapsed `/overview`, `/`, and `/offer` from slide-deck / multi-card layouts into pure prose. Keep the v1 boutique palette + typography + nav + footer. Add back the visual interludes (diagrams, structured grids, mock UI elements, price panels) from the pre-redesign versions — but woven INTO the v1 essay flow, not as standalone slides.

The shape the user picked: **B + C** = essay backbone with structured visual interludes between prose sections + scroll-driven motion on a small motion budget (per-component bespoke animation for 2–3 high-impact visuals; standard fade-up reveal for the rest).

---

## What's in scope

Three pages get visual interludes inserted into their existing essay structure:

| Page | Current state (v1 shipped) | v2 target |
|---|---|---|
| `/` | Hero + 3 prose sections + CTA | Hero + 4 visual interludes + CTA |
| `/overview` | Hero + 7 prose sections | Hero + 8 visual interludes interleaved with prose |
| `/offer` | Hero + 4 prose rung articles | Hero + ladder-at-a-glance + per-rung 2-col layouts + credits callout |

## What's out of scope

- `/book/*` (5 SKU pages): no change. Stripe + Cal integration preserved verbatim. The v1 brass CSS-swap already shipped.
- `/onepager/`, `/build/`, `/build-onepager/`: no change. Already CSS-swapped in v1.
- `lib/site.css` palette + typography tokens: **no changes to values.** Brass palette, Inter + Playfair, all spacing tokens — reused as-is.
- `lib/site.js` italic-morph + scroll-reveal + smooth-scroll: keep. New per-component motion is additive (new JS functions in `lib/site.js`, gated by `prefers-reduced-motion`).
- Nav, footer, hero blocks across all 3 pages: keep verbatim from v1.
- All `/api/` and `book/_slot-picker.js`: do not touch. All 18 existing tests must remain green.

---

## Design tokens added

Three new shared CSS additions to `lib/site.css`:

1. **`.interlude`** — wrapper class for any structured visual block inside a prose section. Sets max-width, vertical rhythm, subtle background tint (`var(--bg-soft)`), border-radius, padding. Differentiates "visual breakup" from prose without being a heavy card.
2. **`.interlude-bare`** — variant without background (when the component carries its own visual weight, like the mock terminal which has its own card styling).
3. **Motion utilities for grids:** `.stagger-grid` (parent class) + `.stagger-grid > *` with `--stagger-index` data-driven delay. Used by the 8-layer grid + work cards + tool grid + 8-builds strip.

No new colour tokens. No new font imports. Brass palette is sufficient.

---

## Component library (8 reusable visual interludes)

Each component is defined once in `lib/site.css` as a named class (e.g., `.layer-grid`, `.tier-stack`, `.reflex-cards`) and used inline in page HTML. Page-specific overrides go in inline `<style>` blocks per page (matching the v1 pattern).

### 1. `.layer-grid` — 8-layer numbered grid

**Where used:** `/overview` (Visual 2)
**Markup:**
```html
<div class="interlude layer-grid stagger-grid">
  <div class="layer" style="--stagger-index: 0">
    <span class="num">1</span>
    <strong>North Star</strong>
    <p>What you're building a life toward. The frame above the frame.</p>
  </div>
  <!-- 7 more layers -->
</div>
```

**Styling:** 4-column grid on desktop, 2-column on tablet, 1-column on mobile. Each cell: brass numeral in big Playfair, layer name in Inter bold, description in muted ink-soft. Subtle border between cells. Cells fade-up with `--stagger-index * 60ms` delay.

**Motion budget:** bespoke — staggered fade-up on enter viewport. Handled by extending the existing `reveal-on-scroll` observer to read `--stagger-index` from each child.

### 2. `.tier-stack` — tech-stack 4-tier diagram

**Where used:** `/overview` (Visual 3)
**Markup:**
```html
<div class="interlude tier-stack">
  <div class="tier">
    <span class="label">The engine</span>
    <p><strong>Claude</strong> — Anthropic's frontier AI model, running through the Claude Code harness. Handles reasoning, drafting, decision-making.</p>
  </div>
  <!-- 3 more tiers: Connectors / Memory / Automation -->
</div>
```

**Styling:** 4 horizontal full-width bars stacked vertically. Each bar has a brass left-edge accent stripe, a mono uppercase label on the left, and prose on the right. On scroll-into-view, bars stack up with sequential reveal (top to bottom, 100ms apart).

### 3. `.self-portrait` — two-column person/life comparison

**Where used:** `/overview` (Visual 4)
**Markup:**
```html
<div class="interlude self-portrait">
  <div class="column">
    <h4>The person</h4>
    <div class="row"><span class="lab">Values</span><span class="val">Freedom · impact · connection · adventure · nature</span></div>
    <!-- 4 more rows -->
  </div>
  <div class="column">
    <h4>The life, right now</h4>
    <!-- 5 rows -->
  </div>
</div>
```

**Styling:** 2-col on desktop, stacked on mobile. Each column: Playfair h4 + 5 rows of label/value (label in mono uppercase, value in serif italic for emphasis on key words). Standard fade-up reveal.

### 4. `.reflex-cards` — three trigger/behaviour cards

**Where used:** `/overview` (Visual 5)
**Markup:**
```html
<div class="interlude reflex-cards stagger-grid">
  <div class="reflex" style="--stagger-index: 0">
    <span class="trigger">When I decided</span>
    <h5>It captured the decision and the reasoning.</h5>
    <p>I decided to raise my coaching rate. The brain logged <em>"market puts sole-operator AI coaching at $180-300/hr mid-band"</em>, backlinked to my pricing page, and flagged the three prospects still attached to the old rate.</p>
  </div>
  <!-- 2 more reflex cards -->
</div>
```

**Styling:** 3-col grid on desktop, stacked on mobile. Each card: small brass trigger label (uppercase mono) + Playfair h5 + ink-soft body. Subtle bottom rule. Standard stagger reveal.

### 5. `.mock-terminal` — UI mockup of EA output

**Where used:** `/overview` (Visual 6, highest-impact visual)
**Markup:**
```html
<div class="interlude-bare mock-terminal" data-typewriter>
  <span class="prompt">&gt; jane replied · pull context?</span>
  <hr>
  <span class="row"><span class="key">Wiki</span> · tier: live · last update: 19 Apr</span>
  <span class="row"><span class="key">Gmail</span> · 14 msgs · last: today 9:04am</span>
  <!-- more rows -->
  <hr>
  <span class="comment">Pattern: when you're blocked on a CFO gate,</span>
  <span class="comment">offering to meet direct has unblocked it before.</span>
  <span class="comment">Want to try that line?</span>
  <span class="cursor"></span>
  Draft reply? <span class="affordance">y / edit / no</span>
</div>
```

**Styling:** monospace black-on-paper card with brass key colours. Subtle box-shadow. `.key` class brass-bold, `.comment` italic ink-soft, `.affordance` brass. Border-radius matches buttons.

**Motion budget:** bespoke — typewriter reveal. Lines appear one at a time at 80ms intervals when card enters viewport. Cursor blinks. Total animation ~1.2s. Reduced-motion: renders all lines instantly.

**JS:** new function `initTypewriter()` in `lib/site.js` looks for `[data-typewriter]`, observes intersection, walks child `<span class="row|comment|prompt|...">` and reveals them sequentially.

### 6. `.callout-grid` — outcome callouts (big-phrase + caption)

**Where used:** `/overview` (Visual 7), reusable on `/` (Visual 1)
**Markup:**
```html
<div class="interlude callout-grid stagger-grid">
  <div class="callout" style="--stagger-index: 0">
    <div class="big">Nothing falls through.</div>
    <div class="small">Every promise, every decision, every person — held. Your mind stops doing the job of a filing cabinet.</div>
  </div>
  <!-- 2 more -->
</div>
```

**Styling:** 3-col grid (or 2 / 1 on smaller). Each callout: large Playfair italic phrase + small ink-soft caption. Brass top border 2px. Standard stagger reveal.

### 7. `.tool-grid` — six tool-category cells

**Where used:** `/overview` (Visual 8)
**Markup:**
```html
<div class="interlude tool-grid stagger-grid">
  <div class="tool" style="--stagger-index: 0">
    <h5>Customer systems</h5>
    <p class="tag">Your CRM, your deals, your pipeline.</p>
    <p class="eg">HubSpot · Salesforce · Pipedrive · Airtable · Attio</p>
  </div>
  <!-- 5 more cells -->
</div>
```

**Styling:** 3-col × 2-row grid on desktop, 2×3 on tablet, 1-col on mobile. Each cell: Inter bold h5 + mono italic tagline + ink-faint examples list. Brass dot-leader between examples.

### 8. `.rung-ladder` — horizontal price-card ladder

**Where used:** `/offer` (Visual 1, the upfront ladder-at-a-glance) and `/` (Visual 2, compressed 3-rung version)

**Markup (full /offer version):**
```html
<div class="interlude rung-ladder stagger-grid" data-direction="left">
  <a class="rung-card" href="/book/coaching-block" style="--stagger-index: 0">
    <p class="r-name">Coaching Block</p>
    <p class="r-meta">4 × 60 min</p>
    <p class="r-price">$500</p>
    <p class="r-pitch">Build alongside me, weekly.</p>
    <span class="r-cta">Book →</span>
  </a>
  <a class="rung-card hero" href="/book/ea-basic-build" style="--stagger-index: 1">
    <span class="badge">★ Most popular</span>
    <!-- ... -->
  </a>
  <!-- 2 more rungs -->
</div>
```

**Styling:** 4-col grid (3-col on landing where Discovery is dropped). Each card: name + meta (duration) + Playfair big price + pitch + CTA. Hero card gets brass 2px border + "★ Most popular" pill badge. Hover lifts the card 4px with brass shadow. Stagger direction left-to-right.

### Component reuse map

| Component | /overview | / (landing) | /offer |
|---|---|---|---|
| `.layer-grid` | ✓ (Visual 2) | — | — |
| `.tier-stack` | ✓ (Visual 3) | — | — |
| `.self-portrait` | ✓ (Visual 4) | — | — |
| `.reflex-cards` | ✓ (Visual 5) | — | — |
| `.mock-terminal` | ✓ (Visual 6) | — | — |
| `.callout-grid` | ✓ (Visual 7) | ✓ (Visual 1, 3-card capability row) | — |
| `.tool-grid` | ✓ (Visual 8) | — | — |
| `.rung-ladder` | — | ✓ (Visual 2, compressed 3-rung) | ✓ (Visual 1, full 4-rung) |
| `.work-cards` (NEW) | — | ✓ (Visual 3) | — |
| `.builds-strip` (NEW) | — | ✓ (Visual 4) | — |
| `.price-panel` (NEW) | — | — | ✓ (Visuals 2, 3, 4 — per-rung sidebar) |
| `.credit-callout` (NEW) | — | — | ✓ (Visual 5) |

The 4 NEW components are landing-/offer-specific; the 8 from the old `/overview` slide-deck cover the bulk of the work.

### New components defined

**`.work-cards`** — three work entries with headline-stat + glyph
```html
<div class="interlude work-cards stagger-grid">
  <div class="work" style="--stagger-index: 0">
    <span class="glyph">⏱</span>
    <h3>Carbon Tracker</h3>
    <p class="stat">3 days → 20 min</p>
    <p>An 11-agent system for a UK climate consultancy. Triages Scope-3 carbon-accounting questions, cross-checks against historical decisions, shipped in ~6 weeks.</p>
  </div>
  <!-- 2 more -->
</div>
```

3-col grid. Each card: glyph (unicode symbol or small SVG), Playfair h3 title, mono brass stat line, ink-soft prose. Standard stagger.

**`.builds-strip`** — 8 mini-squares for the "8 in 12 months" credential
```html
<div class="interlude-bare builds-strip">
  <div class="build named">Carbon Tracker</div>
  <div class="build named">Derwen</div>
  <div class="build named">This system</div>
  <div class="build hint">Owls Eat Rats</div>
  <div class="build hint">TrailMate</div>
  <div class="build hint">Calm &amp; The Storm</div>
  <div class="build hint">Waste2Wattage</div>
  <div class="build hint">Sasha</div>
</div>
```

Horizontal flex strip, 8 small squares. Named builds: full brass card with name. Hinted: muted olive cards with smaller text and lower opacity. Wraps to 2 rows on mobile.

**`.price-panel`** — right-column sticky sidebar for /offer rung 2-col layouts
```html
<aside class="price-panel">
  <p class="label">Price</p>
  <p class="value">$500</p>
  <p class="note">4 × 60 min sessions · credits toward EA Basic Build</p>
  <a class="cta-primary" href="/book/coaching-block">Book + Pay →</a>
</aside>
```

Sticky on desktop (position: sticky, top-aligned within parent section). Card with brass border-left 3px. Variants: `.price-panel.hero` adds "★ Most popular" badge + brass border-all. `.price-panel.range` for $500-$800 layers.

**`.credit-callout`** — brass-tinted box surfacing the credits mechanic
```html
<div class="interlude credit-callout">
  <p><strong>Coaching credits</strong> apply to the EA Basic Build within 90 days. A $500 block becomes $1,500 to complete the Basic Build — no penalty for starting small.</p>
</div>
```

Subtle brass-tinted background, brass left border 4px. Italic prose. Standard fade-up reveal.

---

## Page assembly

### `/` (landing)

```
[ Nav ]
[ HERO ] — unchanged
[ § lead-in (1 sentence) ]
[ .callout-grid — 3 capability callouts ]   ← NEW VISUAL 1
[ § "How I work" (1 sentence) ]
[ .rung-ladder — 3-rung compressed ]         ← NEW VISUAL 2
[ § "Selected work" (1 sentence) ]
[ .work-cards — 3 work cards with stats ]    ← NEW VISUAL 3
[ .builds-strip — 8 builds ]                 ← NEW VISUAL 4
[ § Final CTA ] — unchanged
[ Footer ]
```

### `/overview`

```
[ Nav ]
[ HERO ] — unchanged
[ § "The missing layer" (1 paragraph) ]
[ .callout-grid — 5 "every AI forgets" lines ]  ← V1
[ § "One brain underneath" (1 paragraph) ]
[ .layer-grid — 8 layers ]                       ← V2 (bespoke motion)
[ § "Under the hood" (1 paragraph) ]
[ .tier-stack — 4 tiers ]                        ← V3
[ § "What it knows about me" (1 paragraph) ]
[ .self-portrait — 2-col ]                       ← V4
[ § "How it gets sharper" (1 paragraph) ]
[ .reflex-cards — 3 reflexes ]                   ← V5
[ § "In your work" (1 paragraph) ]
[ .mock-terminal — typewriter card ]             ← V6 (bespoke motion)
[ § Case study · Carbon Tracker (3 paragraphs) ]
[ .callout-grid — 3 outcome callouts ]           ← V7
[ § "For your business" (1 paragraph) ]
[ .tool-grid — 6 categories ]                    ← V8
[ § Closing CTA ]
[ Footer ]
```

### `/offer`

```
[ Nav ]
[ HERO ] — unchanged
[ .rung-ladder — 4 rungs at a glance ]           ← V1
[ 2-col § Coaching Block | .price-panel ]        ← V2
[ 2-col § EA Basic Build | .price-panel.hero ]   ← V3
[ 2-col § Layers | .price-panel.range ]          ← V4
[ .credit-callout ]                              ← V5
[ § Discovery (single wide card) ]               ← V6
[ Footer ]
```

---

## Motion treatment

**Standard (existing):** `.reveal-on-scroll` with `--reveal-index` stagger. Already shipped in v1. Applied to every prose paragraph + every visual not in the "bespoke" list.

**Bespoke (new, two components):**

1. **`.layer-grid` stagger reveal.** Each `.layer` cell fades in with `--stagger-index * 60ms` delay. JS extension: the existing IntersectionObserver in `lib/site.js` reads `--stagger-index` from children when the parent has `.stagger-grid` class.

2. **`.mock-terminal` typewriter reveal.** New JS function `initTypewriter()` walks child rows when card enters viewport, reveals each at 80ms intervals. Cursor element blinks via CSS animation.

**Reduced-motion:** all bespoke motion disabled (renders instantly). Hover transitions retained.

---

## File-level changes

**Files modified (3):**
- `index.html` — replace 3 prose sections with 4 visual interlude components; keep hero + final CTA + footer + nav
- `overview/index.html` — interleave 8 visual interludes between 7 condensed prose paragraphs; keep hero + closing CTA + footer + nav
- `offer/index.html` — replace 4 prose articles with: upfront ladder + 3 per-rung 2-col layouts + credit callout + Discovery card; keep hero + footer + nav

**Files extended (2):**
- `lib/site.css` — add `.interlude`, `.interlude-bare`, `.stagger-grid`, and all 12 component classes (`.layer-grid`, `.tier-stack`, `.self-portrait`, `.reflex-cards`, `.mock-terminal`, `.callout-grid`, `.tool-grid`, `.rung-ladder`, `.work-cards`, `.builds-strip`, `.price-panel`, `.credit-callout`). Estimated +400 lines.
- `lib/site.js` — extend existing `initScrollReveal()` to read `--stagger-index` from children inside `.stagger-grid` parents. Add new `initTypewriter()` for `[data-typewriter]` elements. Estimated +50 lines.

**Files NOT modified:**
- All `book/*.html` and `book/_styles.css` — no change
- `onepager/`, `build/`, `build-onepager/` — no change
- All `/api/**` — no change
- All `tests/*.test.js` — no change; existing 18 tests must remain green
- `lib/img/` — no change (existing illustration + favicon stay)

---

## Implementation order

1. **Phase 1 — Foundation extensions.** Add `.interlude`, `.interlude-bare`, `.stagger-grid` to `lib/site.css`. Extend `lib/site.js` with `--stagger-index` support + `initTypewriter()`. Verify nothing breaks on existing v1 pages (smoke test the live site).

2. **Phase 2 — `/overview` rebuild.** Highest user-named priority. Implement all 8 visual interludes one-by-one. Each component gets its CSS first (in `lib/site.css`), then its markup in `overview/index.html`. Test each visually on Vercel preview before moving to the next.

3. **Phase 3 — `/` (landing) rebuild.** Reuse `.callout-grid` and `.rung-ladder` (already built in Phase 2). Add `.work-cards` + `.builds-strip` as new components. Assemble landing page.

4. **Phase 4 — `/offer` rebuild.** Build `.rung-ladder` (already built in Phase 3 as compressed version — extend with `.hero` variant + 4-rung mode). Add `.price-panel` + `.credit-callout`. Restructure rung articles into 2-col layouts.

5. **Phase 5 — Cross-page QA.** Lighthouse on all 3 redesigned pages (≥95 target on all 4 metrics, mobile + desktop). WCAG AA contrast on new components. Keyboard nav + visible focus. `prefers-reduced-motion` verification. Real-device iOS + Android. Run `npm test` (all 18 must still pass).

6. **Phase 6 — PR + merge.** Same workflow as v1: feature branch `feat/v2-visual-restoration-2026-05` → PR → user reviews preview → squash-merge → tag `v2.0` → production swap.

---

## Open question (deferred from `/offer` brainstorm)

**Should Single Session ($150) be added back as an entry rung in `/offer`?**

The old pre-redesign `/offer` had it; v1 dropped it. The user clicked "ship-it" on the v2 `/offer` structure without explicitly answering yes/no to the question. Default for this spec: **DO NOT add it back.** v2 ships with the current 4-rung structure (Coaching Block / EA Basic Build / Layers / Discovery). If the user wants it added, that's a one-line addition to the `.rung-ladder` and a small new rung article — easy follow-up, not blocking v2 ship.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Page becomes too long with 8 visual interludes on `/overview` | Each prose section is compressed to 1 paragraph max. Total page length stays under ~1500 vertical pixels of section content (excluding hero + footer). Component-heavy not text-heavy. |
| Typewriter motion feels gimmicky | Constrain to single component (mock terminal), 1.2s total animation, fully disabled under `prefers-reduced-motion`. |
| Stripe + Cal regression on `/book` | Don't touch `/book/*` files at all. Run `npm test` (18 tests) at end of every phase. |
| Mobile UX of multi-column grids | Every grid component has explicit breakpoints: 4-col / 3-col → 2-col → 1-col at 900px / 600px. Designed mobile-first per component. |
| User clicks "ship-it" but actually wanted Single Session restored | Open question section above flags this explicitly. Asked at spec review gate. |

---

## Definition of done

- All 3 pages re-shipped with v2 visual interludes
- All 12 components defined in `lib/site.css` and reused per the component map
- Both bespoke motion treatments working (layer-grid stagger + typewriter terminal)
- All 18 tests still green
- Lighthouse ≥95 on all 4 metrics, mobile + desktop, all 3 redesigned pages
- WCAG AA contrast preserved on new components (especially the brass-on-bg-soft interlude variant)
- `prefers-reduced-motion` disables bespoke animation, retains hover states
- Real-device iOS Safari + Android Chrome verified end-to-end (landing → overview → offer → book → discovery booking)
- User walks the Vercel preview, approves the v2 register matches the boutique-with-visual-richness ambition
- Squash-merged to `main`, tagged `v2.0`, Vercel production deploy verified at crads-ai.com
