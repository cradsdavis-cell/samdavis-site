# crads-ai.com v2 — Visual Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the structured visual richness lost in the v1 boutique redesign — 12 reusable visual interludes woven into the existing essay flow on `/`, `/overview`, `/offer`. Keep the v1 brass palette + Playfair/Inter type + nav + footer unchanged.

**Architecture:** Extend `lib/site.css` with 12 new visual-component classes + `lib/site.js` with stagger-grid support + typewriter motion. Rebuild the three primary pages by interleaving the existing prose with the new components. `/book`, `/onepager`, `/build`, `/build-onepager` are not touched. All 18 existing tests must remain green.

**Tech Stack:** Vanilla HTML/CSS/JS · Vercel · Brass palette + Playfair Display + Inter (already loaded via shared CSS) · IntersectionObserver-driven motion.

**Source spec:** [`docs/superpowers/specs/2026-05-18-crads-ai-v2-visual-restoration-design.md`](../specs/2026-05-18-crads-ai-v2-visual-restoration-design.md)

**Branch:** `feat/v2-visual-restoration-2026-05`

**Production discipline:** Never push to `main` directly. Every commit lands on the feature branch. Vercel auto-deploys previews. User approves final squash-merge.

---

## File Structure

**Files to create:**
- (None — all changes extend existing files)

**Files to modify:**
- `lib/site.css` — append ~400 lines of component CSS (12 components + `.interlude` wrappers + `.stagger-grid` utility)
- `lib/site.js` — extend `initScrollReveal()` for stagger-grid; add `initTypewriter()`. ~50 new lines.
- `index.html` — replace 3 prose sections with 4 visual interludes; keep hero + final CTA + footer + nav
- `overview/index.html` — interleave 8 visual interludes between condensed prose paragraphs; keep hero + closing CTA + footer + nav
- `offer/index.html` — replace prose articles with: upfront ladder + 3 per-rung 2-col layouts + credit callout + Discovery card; keep hero + footer + nav

**Files NOT to touch (out of scope, must remain green):**
- `book/*.html`, `book/_styles.css`, `book/_slot-picker.js` — Stripe + Cal integration preserved
- `onepager/`, `build/`, `build-onepager/` — already CSS-swapped in v1
- `api/**` — all serverless functions
- `tests/*.test.js` — 18 tests must all pass post-merge
- `lib/img/` — existing illustration + favicon reused
- `package.json`, `vercel.json` — no new deps

---

## Phase 0 · Branch Setup

### Task 0.1: Create feature branch

**Files:**
- Modify: git only

- [ ] **Step 1: Verify clean working tree on main**

Run: `cd c:/tmp/samdavis-site && git status`
Expected: `nothing to commit, working tree clean` (the spec was committed on main as `80d157f`)

- [ ] **Step 2: Verify current branch is main + up to date**

Run: `git branch --show-current && git pull`
Expected: `main` then `Already up to date`

- [ ] **Step 3: Create + checkout feature branch**

Run: `git checkout -b feat/v2-visual-restoration-2026-05`
Expected: `Switched to a new branch 'feat/v2-visual-restoration-2026-05'`

- [ ] **Step 4: Push branch upstream**

Run: `git push -u origin feat/v2-visual-restoration-2026-05`
Expected: push success, branch tracking remote.

---

## Phase 1 · Foundation Extensions

### Task 1.1: Add `.interlude` wrappers + `.stagger-grid` utility to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

- [ ] **Step 1: Append the foundation block to `lib/site.css`**

Append to `c:/tmp/samdavis-site/lib/site.css`:

```css

/* ============================================================
   v2 — Visual interlude wrappers
   ============================================================ */

.interlude {
  background: var(--bg-soft);
  border-radius: 8px;
  padding: var(--space-4) var(--space-3);
  margin: var(--space-4) 0;
  max-width: var(--wrap-max);
}

.interlude-bare {
  /* No background — used by components that carry their own card styling (e.g. mock-terminal) */
  margin: var(--space-4) 0;
  max-width: var(--wrap-max);
}

/* Stagger-grid — parent class signals that direct children should reveal with --stagger-index delay */
.stagger-grid {
  /* No visual treatment here; just a hook for JS + CSS-driven stagger */
}

.stagger-grid > .reveal-on-scroll[style*="--stagger-index"] {
  transition-delay: calc(var(--stagger-index, 0) * 80ms);
}

@media (max-width: 600px) {
  .interlude, .interlude-bare {
    padding: var(--space-3) var(--space-2);
    margin: var(--space-3) 0;
  }
}
```

- [ ] **Step 2: Verify file size**

Run: `wc -l c:/tmp/samdavis-site/lib/site.css`
Expected: ~380-400 lines (was 358 pre-append).

- [ ] **Step 3: Commit**

```bash
cd c:/tmp/samdavis-site
git add lib/site.css
git commit -m "feat(css): v2 — .interlude wrappers + .stagger-grid utility"
```

### Task 1.2: Extend `lib/site.js` for stagger-grid

**Files:**
- Modify: `lib/site.js`

- [ ] **Step 1: Update `initScrollReveal()` in `lib/site.js`**

In `c:/tmp/samdavis-site/lib/site.js`, find the existing `initScrollReveal()` function and replace it with the version below. The new version automatically applies `.reveal-on-scroll` + `--stagger-index` to direct children of `.stagger-grid` parents, so authors don't have to mark each child individually.

Replace:
```javascript
  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: just reveal all
      document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer.observe(el));
  }
```

With:
```javascript
  function initScrollReveal() {
    // Auto-apply .reveal-on-scroll + --stagger-index to direct children of .stagger-grid
    document.querySelectorAll('.stagger-grid').forEach((parent) => {
      Array.from(parent.children).forEach((child, idx) => {
        if (!child.classList.contains('reveal-on-scroll')) {
          child.classList.add('reveal-on-scroll');
        }
        if (!child.style.getPropertyValue('--stagger-index')) {
          child.style.setProperty('--stagger-index', idx);
        }
      });
    });

    if (!('IntersectionObserver' in window)) {
      // Fallback: just reveal all
      document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer.observe(el));
  }
```

- [ ] **Step 2: Verify**

Run: `wc -l c:/tmp/samdavis-site/lib/site.js`
Expected: ~105-110 lines (was 93).

- [ ] **Step 3: Commit**

```bash
git add lib/site.js
git commit -m "feat(js): stagger-grid auto-applies .reveal-on-scroll + --stagger-index to children"
```

### Task 1.3: Add `initTypewriter()` to `lib/site.js`

**Files:**
- Modify: `lib/site.js`

- [ ] **Step 1: Add `initTypewriter()` function**

In `c:/tmp/samdavis-site/lib/site.js`, immediately after `initSmoothScroll()` function (before the `// ---------- Init ----------` block), add:

```javascript

  // ---------- Typewriter ----------
  // Walks direct children of [data-typewriter] elements and reveals them
  // one at a time on intersection. Children should have class "tw-line".
  // Respects prefers-reduced-motion.
  function initTypewriter() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-typewriter]').forEach((el) => {
      const lines = el.querySelectorAll('.tw-line');
      if (lines.length === 0) return;

      if (reduced) {
        // Reveal everything immediately
        lines.forEach(line => line.classList.add('tw-revealed'));
        return;
      }

      // Hide all lines initially
      lines.forEach(line => line.classList.remove('tw-revealed'));

      if (!('IntersectionObserver' in window)) {
        lines.forEach(line => line.classList.add('tw-revealed'));
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          // Reveal lines sequentially
          lines.forEach((line, i) => {
            setTimeout(() => line.classList.add('tw-revealed'), i * 90);
          });
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.3 });

      observer.observe(el);
    });
  }
```

Then in the init block at the bottom, add `initTypewriter();` to both branches:

```javascript
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initItalicMorph();
      initScrollReveal();
      initSmoothScroll();
      initTypewriter();
    });
  } else {
    initItalicMorph();
    initScrollReveal();
    initSmoothScroll();
    initTypewriter();
  }
```

- [ ] **Step 2: Add corresponding CSS for `.tw-line` to `lib/site.css`**

Append to `c:/tmp/samdavis-site/lib/site.css`:

```css

/* Typewriter reveal — used by .mock-terminal etc */
.tw-line {
  display: block;
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 0.25s ease-out, transform 0.25s ease-out;
}
.tw-line.tw-revealed {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .tw-line { opacity: 1; transform: none; transition: none; }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/site.js lib/site.css
git commit -m "feat(js,css): initTypewriter — sequential line reveal with prefers-reduced-motion fallback"
git push
```

### Task 1.4: Phase 1 smoke test on existing pages

**Files:**
- (No production file changes — verification only)

- [ ] **Step 1: Verify no regression on shipped v1 pages**

Push branch (already done in 1.3 Step 3). Wait ~90s for Vercel preview build.

In Vercel preview, navigate to `/`, `/overview`, `/offer`. Verify:
- Pages still render identically to current production (`crads-ai.com`)
- Italic morph still cycles on landing
- Scroll-reveal fades still fire on existing sections
- No console errors (open DevTools)
- `/book` still renders, Cal embed loads, Stripe Checkout opens on `/book/coaching-block`

The new `.interlude`, `.stagger-grid`, `.tw-line` classes are not used by any HTML yet, so visual parity with v1 production is expected.

- [ ] **Step 2: Commit verification empty commit**

```bash
git commit --allow-empty -m "test(phase-1): foundation extensions verified — no regression on v1 pages"
git push
```

---

## Phase 2 · `/overview` Rebuild

### Task 2.1: Backup current v1 `/overview` to a new bak file

**Files:**
- Create: `overview/index-v1-essay.html.bak`

The existing `overview/index-pre-redesign.html.bak` is the original slide-deck (pre-v1). We need a separate backup of the v1 essay state for rollback in case the v2 changes go sideways.

- [ ] **Step 1: Backup**

```bash
cd c:/tmp/samdavis-site
cp overview/index.html overview/index-v1-essay.html.bak
```

- [ ] **Step 2: Verify**

Run: `diff overview/index.html overview/index-v1-essay.html.bak`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add overview/index-v1-essay.html.bak
git commit -m "chore(overview): backup v1 essay state pre-v2-visual-restoration"
```

### Task 2.2: Add `.callout-grid` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

The first component shipped. Used by /overview Visual 1 (5-line "every AI forgets" list framed as callouts) and Visual 7 (3 outcome callouts) + landing Visual 1 (3 capability callouts).

- [ ] **Step 1: Append `.callout-grid` block**

Append to `c:/tmp/samdavis-site/lib/site.css`:

```css

/* ============================================================
   v2 — .callout-grid (reusable big-phrase + caption grid)
   Used by: /overview V1 + V7, / (landing) V1
   ============================================================ */

.callout-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.callout-grid .callout {
  padding: var(--space-3);
  border-top: 2px solid var(--accent);
  background: transparent;
}

.callout-grid .callout .big {
  font-family: var(--serif);
  font-style: italic;
  font-weight: 700;
  font-size: clamp(22px, 2.2vw, 28px);
  line-height: 1.2;
  color: var(--ink-deep);
  margin-bottom: var(--space-2);
}

.callout-grid .callout .small {
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink-soft);
}

/* Compact variant — used by /overview V1 (5-line "AI forgets" list) */
.callout-grid.compact {
  grid-template-columns: 1fr;
  gap: var(--space-2);
}
.callout-grid.compact .callout {
  padding: var(--space-2) 0 var(--space-2) var(--space-3);
  border-top: none;
  border-left: 2px solid var(--accent);
}
.callout-grid.compact .callout .big {
  font-size: 18px;
  font-style: normal;
  font-weight: 600;
  font-family: var(--sans);
  margin-bottom: 4px;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .callout-grid component (default + compact variants)"
```

### Task 2.3: Add `.layer-grid` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

The 8-layer numbered grid for /overview Visual 2.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .layer-grid (8 numbered layers in 4-col grid)
   Used by: /overview V2
   ============================================================ */

.layer-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
  background: var(--bg-soft);
}

.layer-grid .layer {
  padding: var(--space-3) var(--space-2);
  border-top: 1px solid var(--rule);
}

.layer-grid .layer .num {
  font-family: var(--serif);
  font-size: 32px;
  font-weight: 800;
  font-style: italic;
  color: var(--accent);
  line-height: 1;
  display: block;
  margin-bottom: var(--space-2);
}

.layer-grid .layer strong {
  display: block;
  font-family: var(--sans);
  font-size: 17px;
  font-weight: 600;
  color: var(--ink-deep);
  margin-bottom: 6px;
}

.layer-grid .layer p {
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink-soft);
}

@media (max-width: 900px) {
  .layer-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .layer-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .layer-grid component (8 numbered layers, 4-col → 2-col → 1-col)"
```

### Task 2.4: Add `.tier-stack` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

The 4-tier tech-stack diagram for /overview Visual 3.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .tier-stack (4 horizontal tech-stack bars)
   Used by: /overview V3
   ============================================================ */

.tier-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tier-stack .tier {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--bg-main);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  align-items: start;
}

.tier-stack .tier .label {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  padding-top: 3px;
}

.tier-stack .tier p {
  font-size: 15.5px;
  line-height: 1.55;
  color: var(--ink-soft);
  margin: 0;
}

.tier-stack .tier p strong {
  color: var(--ink-deep);
  font-weight: 600;
}

@media (max-width: 700px) {
  .tier-stack .tier { grid-template-columns: 1fr; gap: 6px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .tier-stack component (4-tier horizontal stack)"
```

### Task 2.5: Add `.self-portrait` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

Two-column person/life comparison for /overview Visual 4.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .self-portrait (2-col label/value rows)
   Used by: /overview V4
   ============================================================ */

.self-portrait {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.self-portrait .column h4 {
  font-family: var(--serif);
  font-size: 22px;
  font-weight: 700;
  font-style: italic;
  color: var(--accent);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--rule);
}

.self-portrait .column .row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: var(--space-2);
  padding: 10px 0;
  border-bottom: 1px dashed var(--rule);
  font-size: 15px;
  line-height: 1.5;
}
.self-portrait .column .row:last-child { border-bottom: none; }

.self-portrait .column .row .lab {
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
  padding-top: 3px;
}

.self-portrait .column .row .val {
  color: var(--ink-soft);
}
.self-portrait .column .row .val em {
  font-style: italic;
  color: var(--accent);
  font-weight: 600;
}

@media (max-width: 700px) {
  .self-portrait { grid-template-columns: 1fr; gap: var(--space-3); }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .self-portrait component (2-col label/value rows)"
```

### Task 2.6: Add `.reflex-cards` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

Three trigger/behaviour cards for /overview Visual 5.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .reflex-cards (3 trigger-cards)
   Used by: /overview V5
   ============================================================ */

.reflex-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.reflex-cards .reflex {
  padding: var(--space-3);
  background: var(--bg-main);
  border-radius: 6px;
  border-bottom: 2px solid var(--rule);
}

.reflex-cards .reflex .trigger {
  display: inline-block;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.reflex-cards .reflex h5 {
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--ink-deep);
  line-height: 1.25;
  margin-bottom: var(--space-2);
}

.reflex-cards .reflex p {
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--ink-soft);
}
.reflex-cards .reflex p em {
  color: var(--ink-deep);
  font-style: italic;
}

@media (max-width: 900px) {
  .reflex-cards { grid-template-columns: 1fr; gap: var(--space-2); }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .reflex-cards component (3 trigger-cards)"
```

### Task 2.7: Add `.mock-terminal` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

The high-impact mock UI for /overview Visual 6. Uses `.tw-line` (already shipped in Task 1.3) for typewriter motion.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .mock-terminal (UI mockup card with typewriter motion)
   Used by: /overview V6
   ============================================================ */

.mock-terminal {
  font-family: var(--mono);
  font-size: 13.5px;
  line-height: 1.7;
  background: #fdfbf2;
  color: var(--ink-deep);
  padding: var(--space-3) var(--space-3);
  border-radius: 6px;
  border: 1px solid var(--rule);
  box-shadow: 0 2px 12px rgba(143, 117, 48, 0.08);
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.mock-terminal .tw-line.prompt {
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0.01em;
}

.mock-terminal hr {
  border: none;
  border-top: 1px dashed var(--rule);
  margin: 8px 0;
}

.mock-terminal .tw-line.row {
  font-size: 13px;
  color: var(--ink-soft);
}

.mock-terminal .tw-line.row .key {
  display: inline-block;
  min-width: 80px;
  color: var(--accent);
  font-weight: 700;
}

.mock-terminal .tw-line.comment {
  color: var(--ink-soft);
  font-style: italic;
}

.mock-terminal .affordance {
  color: var(--accent);
  font-weight: 700;
}

.mock-terminal .cursor {
  display: inline-block;
  width: 7px;
  height: 14px;
  background: var(--accent);
  vertical-align: middle;
  animation: cursor-blink 0.9s steps(2, start) infinite;
}

@keyframes cursor-blink {
  to { visibility: hidden; }
}

@media (prefers-reduced-motion: reduce) {
  .mock-terminal .cursor { animation: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .mock-terminal component (mock UI card + cursor blink)"
```

### Task 2.8: Add `.tool-grid` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

Six tool-category cells for /overview Visual 8.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .tool-grid (6 tool-category cells)
   Used by: /overview V8
   ============================================================ */

.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.tool-grid .tool {
  padding: var(--space-3);
  background: var(--bg-main);
  border-radius: 6px;
  border-top: 2px solid var(--accent);
}

.tool-grid .tool h5 {
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-deep);
  margin-bottom: 4px;
  letter-spacing: -0.005em;
}

.tool-grid .tool .tag {
  font-family: var(--mono);
  font-size: 12.5px;
  font-style: italic;
  color: var(--ink-soft);
  margin-bottom: var(--space-2);
}

.tool-grid .tool .eg {
  font-size: 13px;
  color: var(--ink-faint);
  letter-spacing: 0.01em;
  line-height: 1.55;
}

@media (max-width: 900px) {
  .tool-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 540px) {
  .tool-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .tool-grid component (3-col → 2-col → 1-col)"
```

### Task 2.9: Rebuild `overview/index.html` with all 8 interludes

**Files:**
- Modify: `overview/index.html` (full rewrite)

- [ ] **Step 1: Replace `overview/index.html` entirely**

Write `c:/tmp/samdavis-site/overview/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>What an AI that knows you actually does — Sam Davis</title>
<meta name="description" content="A walk through the executive-assistant system Sam Davis builds — context, people, voice, drift-catching, and tooling.">
<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
<link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">
<link rel="stylesheet" href="/lib/site.css">
<script defer src="/lib/site.js"></script>
<style>
  .overview-hero {
    display: grid;
    grid-template-columns: 200px 1fr;
    align-items: center;
    gap: var(--space-4);
    padding-top: var(--space-6);
    padding-bottom: var(--space-5);
  }
  .overview-hero img {
    width: 140px;
    height: auto;
  }
  .prose-lead {
    max-width: var(--read-col);
    margin-bottom: var(--space-3);
  }
  @media (max-width: 900px) {
    .overview-hero {
      grid-template-columns: 1fr;
      padding-top: var(--space-5);
    }
    .overview-hero img { margin: 0 auto; }
  }
</style>
</head>
<body>

<nav class="site-nav-bar">
  <a href="/" class="brand">
    <img src="/lib/img/sam-illustration-sm.png" alt="">
    <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  </a>
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="/overview" class="current">Overview</a>
    <a href="/offer">Offer</a>
    <a href="/book">Book →</a>
  </div>
</nav>

<main>
  <section class="overview-hero wrap">
    <img src="/lib/img/sam-illustration.png" alt="" class="float-gentle">
    <div>
      <p class="eyebrow">Overview</p>
      <h1>What an AI that <em>knows you</em> actually does.</h1>
    </div>
  </section>

  <!-- § The missing layer + V1 callout-grid (compact) -->
  <section class="section wrap" id="missing-layer">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ The missing layer</p>
      <h2 class="reveal-on-scroll">Every AI forgets you the moment you close the tab.</h2>
      <p class="reveal-on-scroll prose-lead">A generic AI assistant is a stranger you brief every time. The thing I build instead is a long-term context layer — yours, held somewhere the AI can read.</p>
    </div>
    <div class="interlude callout-grid compact stagger-grid">
      <div class="callout"><div class="big">ChatGPT doesn't know your people, your deals, or your decisions.</div></div>
      <div class="callout"><div class="big">Your calendar doesn't know what was said in the meeting.</div></div>
      <div class="callout"><div class="big">Your notes don't know your voice.</div></div>
      <div class="callout"><div class="big">Your inbox doesn't know what matters this week.</div></div>
      <div class="callout"><div class="big">Seven tools open. Nothing shared between them.</div></div>
    </div>
  </section>

  <!-- § One brain underneath + V2 layer-grid -->
  <section class="section wrap" id="one-brain">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ It knows me</p>
      <h2 class="reveal-on-scroll">Eight layers of <em>structured self-knowledge.</em></h2>
      <p class="reveal-on-scroll prose-lead">Not a notes app. A real model of you — read, written, and reasoned over by the AI. The layers are deliberate: each one a single source of truth, pulled in when relevant. You don't paste your bio into every prompt.</p>
    </div>
    <div class="interlude layer-grid stagger-grid">
      <div class="layer"><span class="num">1</span><strong>North Star</strong><p>What you're building a life toward. The frame above the frame.</p></div>
      <div class="layer"><span class="num">2</span><strong>Philosophy</strong><p>How you operate when no one's watching. Your values, as filters.</p></div>
      <div class="layer"><span class="num">3</span><strong>Self</strong><p>Who you are when you show up. Identity, strengths, voice, patterns.</p></div>
      <div class="layer"><span class="num">4</span><strong>Network</strong><p>Every person in your life — tiered, recalled, linked to the work you share.</p></div>
      <div class="layer"><span class="num">5</span><strong>Past</strong><p>What's happened that still shapes today. Decisions, pivots, lessons.</p></div>
      <div class="layer"><span class="num">6</span><strong>Goals</strong><p>What you're trying to do, now and next. Reviewed weekly.</p></div>
      <div class="layer"><span class="num">7</span><strong>Tasks</strong><p>What's on your plate today — synced with calendar and inbox.</p></div>
      <div class="layer"><span class="num">8</span><strong>Workflow</strong><p>How your days actually run. The routines that hold the rest together.</p></div>
    </div>
  </section>

  <!-- § Under the hood + V3 tier-stack -->
  <section class="section wrap" id="under-hood">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ Under the hood</p>
      <h2 class="reveal-on-scroll">Real tools. Open protocols. <em>Your data, your system.</em></h2>
      <p class="reveal-on-scroll prose-lead">Not magic. Not a black box. A specific stack — built on open standards so you're never locked in. If the system ever stops serving you, you walk away with everything in plain text.</p>
    </div>
    <div class="interlude-bare tier-stack stagger-grid">
      <div class="tier reveal-on-scroll">
        <span class="label">The engine</span>
        <p><strong>Claude</strong> — Anthropic's frontier AI model, running through the Claude Code harness. Handles reasoning, drafting, decision-making, conversation.</p>
      </div>
      <div class="tier reveal-on-scroll">
        <span class="label">The connectors</span>
        <p>Seven live integrations via the open <strong>Model Context Protocol</strong>. Gmail · Calendar · Google Sheets · Todoist · WhatsApp · Perplexity · Browser (Playwright).</p>
      </div>
      <div class="tier reveal-on-scroll">
        <span class="label">The memory</span>
        <p>A <strong>plain-text wiki</strong> on your own machine. Every person, decision, project, routine — stored as markdown files you can read, edit, export, walk away with.</p>
      </div>
      <div class="tier reveal-on-scroll">
        <span class="label">The automation</span>
        <p><strong>Scheduled watchers</strong> running in the background. Inbox scanned every 15 minutes. Calendar on the hour. Tasks every 30. Nothing you have to remember to run.</p>
      </div>
    </div>
  </section>

  <!-- § What it knows about me + V4 self-portrait -->
  <section class="section wrap" id="knows-me-portrait">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ What it knows about me</p>
      <h2 class="reveal-on-scroll">To a T. <em>To the sentence.</em></h2>
      <p class="reveal-on-scroll prose-lead">The kind of context a great human assistant builds over ten years — in a system that can be queried in a second.</p>
    </div>
    <div class="interlude self-portrait">
      <div class="column reveal-on-scroll">
        <h4>The person</h4>
        <div class="row"><span class="lab">Values</span><span class="val">Freedom · impact · connection · adventure · nature</span></div>
        <div class="row"><span class="lab">Voice</span><span class="val">Direct, concrete, contrast-framed. <em>No LinkedIn register.</em></span></div>
        <div class="row"><span class="lab">Patterns</span><span class="val">Pivots are deepening, not quitting. Wild and calm, always both.</span></div>
        <div class="row"><span class="lab">Filters</span><span class="val">Any decision runs through five North-Star checks before it's made.</span></div>
        <div class="row"><span class="lab">Red lines</span><span class="val">No performative masculinity. No inflated positioning. No flattery.</span></div>
      </div>
      <div class="column reveal-on-scroll">
        <h4>The life, right now</h4>
        <div class="row"><span class="lab">Network</span><span class="val">127 people tiered by closeness; 8 core, 14 live.</span></div>
        <div class="row"><span class="lab">Priorities</span><span class="val">Earn this month · land a UK placement · ship PhD</span></div>
        <div class="row"><span class="lab">Live threads</span><span class="val">Abbey · Eleni · 3 TES apps</span></div>
        <div class="row"><span class="lab">Open loops</span><span class="val">Mum's birthday in 9 days · climbing off 6 weeks</span></div>
        <div class="row"><span class="lab">On the horizon</span><span class="val">UK move late Aug · farewell tour · overland dream after</span></div>
      </div>
    </div>
  </section>

  <!-- § How it gets sharper + V5 reflex-cards -->
  <section class="section wrap" id="how-sharper">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ How it gets sharper</p>
      <h2 class="reveal-on-scroll">It updates itself <em>while you work.</em></h2>
      <p class="reveal-on-scroll prose-lead">You don't maintain the brain. You use it, and it keeps itself current — quietly, in the background. Real things that happened in mine last month:</p>
    </div>
    <div class="interlude reflex-cards stagger-grid">
      <div class="reflex">
        <span class="trigger">When I decided</span>
        <h5>It captured the decision and the reasoning.</h5>
        <p>I decided to raise my coaching rate. The brain logged <em>"market puts sole-operator AI coaching at $180–300/hr mid-band"</em>, backlinked to my pricing page, and flagged the three prospects still attached to the old rate.</p>
      </div>
      <div class="reflex">
        <span class="trigger">When someone new entered</span>
        <h5>It built them a page.</h5>
        <p>A mentor mentioned a school head I should know. The brain created her entity page, inferred the two-way relationship to the mentor, and had her context ready the next time I drafted outreach.</p>
      </div>
      <div class="reflex">
        <span class="trigger">When facts contradicted</span>
        <h5>It flagged the conflict.</h5>
        <p>My draft bio said <em>"coaching since 2024"</em>. The wiki said 2025. The brain paused, asked which was right, and updated the single source of truth once I confirmed.</p>
      </div>
    </div>
  </section>

  <!-- § In your work + V6 mock-terminal -->
  <section class="section wrap" id="in-your-work">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ In your work</p>
      <h2 class="reveal-on-scroll">It holds <em>every thread</em> across every channel.</h2>
      <p class="reveal-on-scroll prose-lead">A prospect replies. Before you answer, the brain pulls their full history — every email, every meeting, every message, what you charged, what you promised, what you decided last time. Ten seconds. One view. Then it drafts the reply in your voice.</p>
    </div>
    <div class="interlude-bare mock-terminal" data-typewriter>
      <span class="tw-line prompt">&gt; jane replied · pull context?</span>
      <hr>
      <span class="tw-line row"><span class="key">Wiki</span>· tier: live · last update: 19 Apr</span>
      <span class="tw-line row"><span class="key">Gmail</span>· 14 msgs · last: today 9:04am</span>
      <span class="tw-line row"><span class="key">WhatsApp</span>· 6 msgs · last: today 8:47am</span>
      <span class="tw-line row"><span class="key">Calendar</span>· 2 past · 1 upcoming</span>
      <span class="tw-line row"><span class="key">Todoist</span>· 3 open tasks</span>
      <span class="tw-line row"><span class="key">Decisions</span>· 2 (proposal $4k · CFO gate)</span>
      <hr>
      <span class="tw-line comment">Pattern: when you're blocked on a CFO gate,</span>
      <span class="tw-line comment">offering to meet direct has unblocked it before.</span>
      <span class="tw-line comment">Want to try that line?</span>
      <span class="tw-line">Draft reply? <span class="affordance">y / edit / no</span><span class="cursor"></span></span>
    </div>
  </section>

  <!-- § Case study + V7 callout-grid -->
  <section class="section wrap" id="carbon-tracker">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ Case study · Carbon Tracker</p>
      <h2 class="reveal-on-scroll">Eleven agents. <em>Six weeks.</em></h2>
      <p class="reveal-on-scroll prose-lead">A UK climate consultancy was spending three days per client triaging Scope-3 carbon-accounting questions across multiple frameworks. I designed an eleven-agent pipeline that triages incoming questions, decides which framework applies, cross-checks against historical decisions, and surfaces auditable reasoning. Each agent has one job. Each handoff is logged. Time-to-answer dropped from three days to under twenty minutes; the consultancy now uses it as the first-pass on every client engagement.</p>
    </div>
    <div class="interlude callout-grid stagger-grid">
      <div class="callout">
        <div class="big">Nothing falls through.</div>
        <div class="small">Every promise, every decision, every person — held. Your mind stops doing the job of a filing cabinet.</div>
      </div>
      <div class="callout">
        <div class="big">You sound like yourself.</div>
        <div class="small">Every reply, every message, every draft — in your voice, from your actual memory. Not generic AI output.</div>
      </div>
      <div class="callout">
        <div class="big">You think more clearly.</div>
        <div class="small">Because the system holds the context, you don't have to. Your best hours go to the work, not to remembering.</div>
      </div>
    </div>
  </section>

  <!-- § For your business + V8 tool-grid -->
  <section class="section wrap" id="for-your-business">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">§ For your business</p>
      <h2 class="reveal-on-scroll">Any tool you use already. <em>Wired into one brain.</em></h2>
      <p class="reveal-on-scroll prose-lead">Seven integrations live in my own system. Hundreds more exist — and if your tool has an API, it can wire into yours. Built around your stack, not mine.</p>
    </div>
    <div class="interlude tool-grid stagger-grid">
      <div class="tool">
        <h5>Customer systems</h5>
        <p class="tag">Your CRM, your deals, your pipeline.</p>
        <p class="eg">HubSpot · Salesforce · Pipedrive · Airtable · Attio</p>
      </div>
      <div class="tool">
        <h5>Communications</h5>
        <p class="tag">Every channel your clients and team use.</p>
        <p class="eg">Slack · Teams · Email · WhatsApp · SMS</p>
      </div>
      <div class="tool">
        <h5>Operations</h5>
        <p class="tag">Your workspace — read and written to.</p>
        <p class="eg">Notion · Asana · Linear · Trello · Google Workspace</p>
      </div>
      <div class="tool">
        <h5>Money</h5>
        <p class="tag">Invoicing, payments, book-keeping.</p>
        <p class="eg">Stripe · Xero · QuickBooks · bank feeds</p>
      </div>
      <div class="tool">
        <h5>Client-facing</h5>
        <p class="tag">Scheduling, proposals, follow-through.</p>
        <p class="eg">Calendly · Cal.com · DocuSign · Mailchimp · Beehiiv</p>
      </div>
      <div class="tool">
        <h5>Anything bespoke</h5>
        <p class="tag">Your internal tools, your own database.</p>
        <p class="eg">REST APIs · webhooks · custom MCP servers</p>
      </div>
    </div>
  </section>

  <!-- Closing CTA -->
  <section class="section section-tight wrap" id="overview-cta">
    <div class="read-col">
      <h2 class="reveal-on-scroll">Want to see one of these run live?</h2>
      <p class="lede reveal-on-scroll">Book a thirty-minute call. I'll demo the system that runs this site.</p>
      <a class="cta-primary reveal-on-scroll" href="/book">Book a 30-minute call</a>
    </div>
  </section>
</main>

<footer class="site-footer wrap">
  <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  <div><a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a></div>
  <div><a href="https://linkedin.com/in/samuel-davis4" target="_blank" rel="noopener">linkedin.com/in/samuel-davis4</a></div>
  <div>+61 0493 302 154</div>
  <div class="location">Coogee, Sydney.</div>
</footer>

</body>
</html>
```

- [ ] **Step 2: Verify line count**

Run: `wc -l overview/index.html`
Expected: ~210-230 lines.

- [ ] **Step 3: Commit + push**

```bash
git add overview/index.html
git commit -m "feat(overview): v2 — 8 visual interludes interleaved with condensed prose"
git push
```

### Task 2.10: Mobile + cross-browser verification for /overview

**Files:**
- (Possibly minor CSS tweaks in `lib/site.css` if findings)

- [ ] **Step 1: Vercel preview check**

Wait ~90s for Vercel preview deploy. Visit preview `/overview` URL.

Verify (desktop):
- All 8 visual interludes render with brass palette + correct typography
- layer-grid: 4-col on desktop, numbered cells stagger fade-in
- tier-stack: 4 horizontal bars with brass left-accent
- self-portrait: 2-col with label/value rows
- reflex-cards: 3-col cards with brass trigger labels
- mock-terminal: monospace card, lines type in sequence on scroll-into-view, brass cursor blinks at end
- callout-grids: 5-line compact + 3-card normal both render
- tool-grid: 3×2 grid

Verify (mobile, via Chrome DevTools device emulator iPhone 12 Pro 390×844):
- layer-grid collapses to 2-col then 1-col
- tier-stack stacks vertically with single-col layout per tier
- self-portrait stacks 2-col → 1-col
- reflex-cards stacks 3 → 1
- mock-terminal stays readable (font-size 13.5px, max-width 600px should auto-shrink)
- tool-grid 3-col → 2-col → 1-col

- [ ] **Step 2: Fix any responsive issues found**

If any component breaks at a breakpoint, add a media-query fix in `lib/site.css` and commit with `fix(overview): <description>`.

- [ ] **Step 3: Commit verification empty commit**

```bash
git commit --allow-empty -m "test(overview): mobile + cross-browser verified"
git push
```

---

## Phase 3 · `/` Landing Rebuild

### Task 3.1: Backup current v1 `index.html`

**Files:**
- Create: `index-v1-essay.html.bak`

- [ ] **Step 1: Backup**

```bash
cp index.html index-v1-essay.html.bak
diff index.html index-v1-essay.html.bak  # expect no output
git add index-v1-essay.html.bak
git commit -m "chore: backup v1 essay landing pre-v2"
```

### Task 3.2: Add `.work-cards` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

Three work entries with glyph + headline-stat + prose, for landing Visual 3.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .work-cards (3 work entries with glyph + stat)
   Used by: / (landing) V3
   ============================================================ */

.work-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.work-cards .work {
  padding: var(--space-3);
  background: var(--bg-main);
  border-radius: 6px;
  border-top: 2px solid var(--accent);
}

.work-cards .work .glyph {
  display: inline-block;
  font-size: 28px;
  line-height: 1;
  color: var(--accent);
  margin-bottom: var(--space-2);
}

.work-cards .work h3 {
  font-family: var(--serif);
  font-size: 22px;
  font-weight: 700;
  color: var(--ink-deep);
  margin-bottom: 6px;
}

.work-cards .work .stat {
  font-family: var(--mono);
  font-size: 13px;
  letter-spacing: 0.05em;
  color: var(--accent);
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: var(--space-2);
}

.work-cards .work p {
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--ink-soft);
}

@media (max-width: 900px) {
  .work-cards { grid-template-columns: 1fr; gap: var(--space-2); }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .work-cards component (3 work entries with glyph + stat)"
```

### Task 3.3: Add `.builds-strip` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

8-builds horizontal strip for landing Visual 4.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .builds-strip (8 mini-squares — 3 named + 5 hinted)
   Used by: / (landing) V4
   ============================================================ */

.builds-strip {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}

.builds-strip .build {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-radius: 4px;
  padding: 4px;
  font-family: var(--sans);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
}

.builds-strip .build.named {
  background: var(--accent);
  color: var(--bg-main);
}

.builds-strip .build.hint {
  background: var(--bg-card);
  color: var(--ink-soft);
  opacity: 0.7;
  font-weight: 500;
  font-size: 9.5px;
}

@media (max-width: 600px) {
  .builds-strip { grid-template-columns: repeat(4, 1fr); }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .builds-strip component (8 mini-squares, named + hinted)"
```

### Task 3.4: Add `.rung-ladder` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

Reusable price-card row. Built once here, used by landing (3-rung compressed) AND /offer (4-rung full) with `.hero` variant for the most-popular card.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .rung-ladder (horizontal price-card row)
   Used by: / (landing) V2 (3-rung), /offer V1 (4-rung)
   ============================================================ */

.rung-ladder {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-2);
}

.rung-ladder .rung-card {
  position: relative;
  display: block;
  padding: var(--space-3);
  background: var(--bg-main);
  border: 1px solid var(--rule);
  border-radius: 6px;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.rung-ladder .rung-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 20px rgba(143, 117, 48, 0.15);
  border-color: var(--accent);
}

.rung-ladder .rung-card.hero {
  border: 2px solid var(--accent);
  background: var(--bg-soft);
}

.rung-ladder .rung-card.hero .badge {
  position: absolute;
  top: -10px;
  left: 16px;
  background: var(--accent);
  color: var(--bg-main);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
}

.rung-ladder .rung-card .r-name {
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 6px;
}

.rung-ladder .rung-card .r-meta {
  font-size: 13px;
  color: var(--ink-faint);
  margin-bottom: var(--space-2);
}

.rung-ladder .rung-card .r-price {
  font-family: var(--serif);
  font-size: 28px;
  font-weight: 800;
  color: var(--ink-deep);
  line-height: 1;
  margin-bottom: var(--space-2);
}

.rung-ladder .rung-card .r-pitch {
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink-soft);
  margin-bottom: var(--space-3);
}

.rung-ladder .rung-card .r-cta {
  display: inline-block;
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--accent);
  border-bottom: 1px dashed var(--accent);
  padding-bottom: 1px;
}
.rung-ladder .rung-card:hover .r-cta {
  color: var(--accent-deep);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .rung-ladder component (price cards with .hero variant)"
```

### Task 3.5: Rebuild `index.html` with 4 visual interludes

**Files:**
- Modify: `index.html` (full rewrite)

- [ ] **Step 1: Replace `index.html` entirely**

Write `c:/tmp/samdavis-site/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sam Davis — AI executive assistants for founders</title>
<meta name="description" content="I build AI executive assistants that learn your voice, your people, your priorities. For founders who want their AI to actually understand them.">
<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
<link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">
<link rel="stylesheet" href="/lib/site.css">
<script defer src="/lib/site.js"></script>
<style>
  .hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: var(--space-5);
    padding-top: var(--space-7);
    padding-bottom: var(--space-6);
  }
  .hero-illustration img { width: 100%; max-width: 480px; height: auto; }
  .hero-copy h1 { margin: var(--space-3) 0; }
  .hero-copy .lede { margin-bottom: var(--space-4); }
  .hero-ctas { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
  .hero-proof { font-size: 15px; color: var(--ink-faint); line-height: 1.5; max-width: 540px; }
  .hero-proof em { font-style: italic; }

  .prose-lead { max-width: var(--read-col); margin-bottom: var(--space-3); }

  @media (max-width: 900px) {
    .hero { grid-template-columns: 1fr; padding-top: var(--space-5); padding-bottom: var(--space-5); gap: var(--space-3); }
    .hero-illustration { order: -1; max-width: 240px; margin: 0 auto; }
  }
  @media (max-width: 600px) {
    .hero-ctas { flex-direction: column; align-items: stretch; }
    .hero-ctas .cta-secondary { text-align: center; }
  }
</style>
</head>
<body>

<nav class="site-nav-bar">
  <a href="/" class="brand">
    <img src="/lib/img/sam-illustration-sm.png" alt="">
    <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  </a>
  <div class="nav-links">
    <a href="/" class="current">Home</a>
    <a href="/overview">Overview</a>
    <a href="/offer">Offer</a>
    <a href="/book">Book →</a>
  </div>
</nav>

<main>
  <!-- Hero (unchanged from v1) -->
  <section class="hero wrap">
    <div class="hero-illustration">
      <img src="/lib/img/sam-illustration.png" srcset="/lib/img/sam-illustration-sm.png 320w, /lib/img/sam-illustration.png 1200w" sizes="(max-width: 900px) 320px, 480px" alt="Sam Davis — illustration of a person holding a small tech-and-leaves icon" class="float-gentle">
    </div>
    <div class="hero-copy">
      <p class="eyebrow">SAM DAVIS · PhD ENVIRONMENTAL DATA SCIENCE · 8 AI BUILDS IN 12 MONTHS</p>
      <h1>An AI executive assistant that <span class="italic-morph" data-phrases="chief of staff would|longtime colleague would|thoughtful editor would">chief of staff would</span>.</h1>
      <p class="lede">I build AI that learns your voice, your people, your priorities — for founders who want their AI to actually understand them.</p>
      <div class="hero-ctas">
        <a class="cta-primary" href="/book">Book a 30-minute call</a>
        <a class="cta-secondary" href="#work">See the work</a>
      </div>
      <p class="hero-proof"><em>Eight AI systems shipped in twelve months — Carbon Tracker for a UK climate consultancy, Derwen, the system running this site.</em></p>
    </div>
  </section>

  <!-- V1 — Capability callouts -->
  <section class="section wrap" id="capabilities">
    <div class="interlude callout-grid stagger-grid">
      <div class="callout">
        <div class="big">Drafts in your voice.</div>
        <div class="small">Not generic AI output — your phrasing, your rhythms, your signature moves. Seven-check audit on every outbound draft.</div>
      </div>
      <div class="callout">
        <div class="big">Knows every person.</div>
        <div class="small">Every name has a page. The assistant pulls relationship history before you reply. Tiered: core, live, warm, dormant.</div>
      </div>
      <div class="callout">
        <div class="big">Catches drift before you do.</div>
        <div class="small">Daily lint surfaces what's slipping. Weekly sync reconciles goals against active work. You stop maintaining; the system surfaces.</div>
      </div>
    </div>
  </section>

  <!-- V2 — 3-rung ladder -->
  <section class="section wrap" id="how">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">How I work</p>
      <h2 class="reveal-on-scroll">Three rungs. <em>Start anywhere.</em></h2>
    </div>
    <div class="interlude-bare rung-ladder stagger-grid" style="margin-top: var(--space-3);">
      <a class="rung-card" href="/book/coaching-block">
        <p class="r-name">Coaching Block</p>
        <p class="r-meta">4 × 60 min</p>
        <p class="r-price">$500</p>
        <p class="r-pitch">Build alongside me, weekly.</p>
        <span class="r-cta">Book →</span>
      </a>
      <a class="rung-card hero" href="/book/ea-basic-build">
        <span class="badge">★ Most popular</span>
        <p class="r-name">EA Basic Build</p>
        <p class="r-meta">One-week sprint</p>
        <p class="r-price">$2,000</p>
        <p class="r-pitch">I install the whole assistant for you.</p>
        <span class="r-cta">Book →</span>
      </a>
      <a class="rung-card" href="/offer#layers">
        <p class="r-name">Layers</p>
        <p class="r-meta">Async add-ons</p>
        <p class="r-price">$500–800</p>
        <p class="r-pitch">Capabilities stack post-build.</p>
        <span class="r-cta">Learn more →</span>
      </a>
    </div>
    <p class="reveal-on-scroll" style="text-align: center; margin-top: var(--space-3);"><a class="cta-secondary" href="/offer">See the full offer →</a></p>
  </section>

  <!-- V3 — Work cards -->
  <section class="section wrap" id="work">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll">Selected work</p>
      <h2 class="reveal-on-scroll">Eight AI systems shipped in twelve months.</h2>
    </div>
    <div class="interlude work-cards stagger-grid">
      <div class="work">
        <span class="glyph">⏱</span>
        <h3>Carbon Tracker</h3>
        <p class="stat">3 days → 20 min</p>
        <p>An eleven-agent system for a UK climate consultancy. Triages Scope-3 carbon-accounting questions, cross-checks against historical decisions. Shipped in ~6 weeks.</p>
      </div>
      <div class="work">
        <span class="glyph">🌿</span>
        <h3>Derwen</h3>
        <p class="stat">Live in 2 weeks</p>
        <p>AI biodiversity assistant — reads a habitat description, recommends species, surfaces peer-reviewed evidence. Live at <a href="https://derwenai.replit.app" target="_blank" rel="noopener">derwenai.replit.app</a>.</p>
      </div>
      <div class="work">
        <span class="glyph">◆</span>
        <h3>This system</h3>
        <p class="stat">Drafts every page here</p>
        <p>The executive assistant that runs this site, tracks every conversation, drafts in my voice. Demo'd live on prospect calls — easier than explaining.</p>
      </div>
    </div>

    <!-- V4 — Builds strip -->
    <div class="interlude-bare builds-strip" style="margin-top: var(--space-4);">
      <div class="build named">Carbon Tracker</div>
      <div class="build named">Derwen</div>
      <div class="build named">This system</div>
      <div class="build hint">Owls Eat Rats</div>
      <div class="build hint">TrailMate</div>
      <div class="build hint">Calm &amp; Storm</div>
      <div class="build hint">Waste2Wattage</div>
      <div class="build hint">Sasha</div>
    </div>
    <p class="reveal-on-scroll work-closing" style="text-align: center; margin-top: var(--space-3); font-style: italic; color: var(--ink-soft); font-size: 14.5px;">Happy to walk through any of them on a call.</p>
  </section>

  <!-- Final CTA (unchanged from v1) -->
  <section class="section section-tight wrap" id="final-cta">
    <div class="read-col">
      <h2 class="reveal-on-scroll">If any of this is the shape of what you've been trying to build —</h2>
      <p class="lede reveal-on-scroll">Book a thirty-minute call. No pitch.</p>
      <a class="cta-primary reveal-on-scroll" href="/book">Book a 30-minute call</a>
    </div>
  </section>
</main>

<footer class="site-footer wrap">
  <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  <div><a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a></div>
  <div><a href="https://linkedin.com/in/samuel-davis4" target="_blank" rel="noopener">linkedin.com/in/samuel-davis4</a></div>
  <div>+61 0493 302 154</div>
  <div class="location">Coogee, Sydney.</div>
</footer>

</body>
</html>
```

- [ ] **Step 2: Verify line count**

Run: `wc -l index.html`
Expected: ~155-175 lines.

- [ ] **Step 3: Commit + push**

```bash
git add index.html
git commit -m "feat(index): v2 — 4 visual interludes (callouts, rung-ladder, work-cards, builds-strip)"
git push
```

### Task 3.6: Mobile verification for landing

**Files:**
- (Possibly minor CSS tweaks if findings)

- [ ] **Step 1: Vercel preview check on `/`**

Wait ~90s, then visit preview `/`. Verify desktop + mobile:
- Hero unchanged (italic morph cycles, illustration floats)
- callout-grid: 3 capability cards, fade-up stagger
- rung-ladder: 3 cards side-by-side, EA Basic Build is the brass-bordered hero with "★ Most popular" badge
- work-cards: 3 cards with glyphs and brass stat lines
- builds-strip: 8 squares (3 brass + 5 olive), wraps to 4-col on mobile

- [ ] **Step 2: Fix any responsive issues**

If a component breaks, commit fix as `fix(index): <description>`.

- [ ] **Step 3: Commit empty verification**

```bash
git commit --allow-empty -m "test(index): landing mobile + cross-browser verified"
git push
```

---

## Phase 4 · `/offer` Rebuild

### Task 4.1: Backup current v1 `/offer`

**Files:**
- Create: `offer/index-v1-essay.html.bak`

- [ ] **Step 1: Backup + commit**

```bash
cp offer/index.html offer/index-v1-essay.html.bak
git add offer/index-v1-essay.html.bak
git commit -m "chore(offer): backup v1 essay state pre-v2"
```

### Task 4.2: Add `.price-panel` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

Right-column price-panel for /offer per-rung 2-col layouts.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .price-panel (right-col sidebar for /offer rung sections)
   Used by: /offer V2, V3, V4
   ============================================================ */

.price-panel {
  background: var(--bg-soft);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  padding: var(--space-3);
  position: relative;
}

.price-panel.hero {
  border: 2px solid var(--accent);
  background: var(--bg-main);
}

.price-panel.hero .panel-badge {
  position: absolute;
  top: -10px;
  left: 16px;
  background: var(--accent);
  color: var(--bg-main);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
}

.price-panel .label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
  font-weight: 600;
  margin-bottom: 6px;
}

.price-panel .value {
  font-family: var(--serif);
  font-size: 38px;
  font-weight: 800;
  color: var(--ink-deep);
  line-height: 1;
  margin-bottom: var(--space-2);
}

.price-panel .note {
  font-size: 13.5px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin-bottom: var(--space-3);
}

.price-panel .cta-primary {
  width: 100%;
  text-align: center;
}

.price-panel .cta-secondary {
  display: inline-block;
  margin-top: var(--space-2);
}

@media (min-width: 900px) {
  .price-panel.sticky { position: sticky; top: var(--space-4); }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .price-panel component (sidebar, hero variant, sticky)"
```

### Task 4.3: Add `.credit-callout` CSS to `lib/site.css`

**Files:**
- Modify: `lib/site.css` (append)

Brass-tinted callout box for the credits mechanic.

- [ ] **Step 1: Append block**

```css

/* ============================================================
   v2 — .credit-callout (brass-tinted callout box)
   Used by: /offer V5
   ============================================================ */

.credit-callout {
  background: var(--bg-soft);
  border-left: 4px solid var(--accent);
  border-radius: 4px;
  padding: var(--space-3);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-soft);
  font-style: italic;
}

.credit-callout strong {
  color: var(--ink-deep);
  font-style: normal;
  font-weight: 700;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): .credit-callout component"
```

### Task 4.4: Rebuild `offer/index.html` with 6 visual interludes

**Files:**
- Modify: `offer/index.html` (full rewrite)

- [ ] **Step 1: Replace `offer/index.html` entirely**

Write `c:/tmp/samdavis-site/offer/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>How we work together — Sam Davis</title>
<meta name="description" content="The full founder ladder — Coaching Block, EA Basic Build, Layers — plus the free Discovery call to scope.">
<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
<link rel="stylesheet" href="/lib/site.css">
<script defer src="/lib/site.js"></script>
<style>
  .offer-hero {
    display: grid;
    grid-template-columns: 200px 1fr;
    align-items: center;
    gap: var(--space-4);
    padding-top: var(--space-6);
    padding-bottom: var(--space-4);
  }
  .offer-hero img { width: 140px; height: auto; }
  .prose-lead { max-width: var(--read-col); margin-bottom: var(--space-3); }
  .rung-detail {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: var(--space-4);
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--rule);
  }
  .rung-detail:last-of-type { border-bottom: none; }
  .rung-detail .prose .best-for { font-size: 14.5px; color: var(--ink-soft); margin-top: var(--space-2); }
  .rung-detail .prose .best-for strong { color: var(--ink-deep); }
  .discovery-card {
    background: var(--bg-soft);
    border-radius: 6px;
    padding: var(--space-4);
    text-align: center;
    margin-top: var(--space-4);
  }
  .discovery-card h2 { margin-bottom: var(--space-2); }
  .discovery-card .meta { display: inline-block; margin-bottom: var(--space-3); }
  .discovery-card p { max-width: 540px; margin: 0 auto var(--space-3); color: var(--ink-soft); }
  @media (max-width: 900px) {
    .offer-hero { grid-template-columns: 1fr; }
    .offer-hero img { margin: 0 auto; }
    .rung-detail { grid-template-columns: 1fr; gap: var(--space-3); }
  }
</style>
</head>
<body>

<nav class="site-nav-bar">
  <a href="/" class="brand">
    <img src="/lib/img/sam-illustration-sm.png" alt="">
    <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  </a>
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="/overview">Overview</a>
    <a href="/offer" class="current">Offer</a>
    <a href="/book">Book →</a>
  </div>
</nav>

<main>
  <!-- Hero (unchanged from v1) -->
  <section class="offer-hero wrap">
    <img src="/lib/img/sam-illustration.png" alt="" class="float-gentle">
    <div>
      <p class="eyebrow">Offer</p>
      <h1>How we <em>work together.</em></h1>
    </div>
  </section>

  <!-- V1 — Ladder at a glance (4 rungs) -->
  <section class="section section-tight wrap" id="ladder">
    <p class="eyebrow reveal-on-scroll" style="text-align: center;">The ladder at a glance</p>
    <h2 class="reveal-on-scroll" style="text-align: center; margin-bottom: var(--space-4);">Pick where you start.</h2>
    <div class="interlude-bare rung-ladder stagger-grid">
      <a class="rung-card" href="#coaching-block">
        <p class="r-name">Coaching Block</p>
        <p class="r-meta">4 × 60 min</p>
        <p class="r-price">$500</p>
        <p class="r-pitch">Build alongside me, weekly.</p>
        <span class="r-cta">Read more →</span>
      </a>
      <a class="rung-card hero" href="#ea-basic-build">
        <span class="badge">★ Most popular</span>
        <p class="r-name">EA Basic Build</p>
        <p class="r-meta">One-week sprint</p>
        <p class="r-price">$2,000</p>
        <p class="r-pitch">I install the whole assistant.</p>
        <span class="r-cta">Read more →</span>
      </a>
      <a class="rung-card" href="#layers">
        <p class="r-name">Layers</p>
        <p class="r-meta">Async add-ons</p>
        <p class="r-price">$500–800</p>
        <p class="r-pitch">Capabilities stack post-build.</p>
        <span class="r-cta">Read more →</span>
      </a>
      <a class="rung-card" href="#discovery">
        <p class="r-name">Discovery</p>
        <p class="r-meta">30 min · free</p>
        <p class="r-price">Free</p>
        <p class="r-pitch">Not sure which fits? Start here.</p>
        <span class="r-cta">Read more →</span>
      </a>
    </div>
  </section>

  <!-- V2 — Coaching Block rung (2-col with price-panel) -->
  <section class="section wrap">
    <article class="rung-detail reveal-on-scroll" id="coaching-block">
      <div class="prose">
        <p class="eyebrow">Coaching Block</p>
        <h2>Build alongside me. <em>Four sessions, $500.</em></h2>
        <p>For founders who want the assistant installed into their actual workflow, in real time, with me alongside. Session one establishes context. Sessions two through four are us building together — your voice profile, your people, your priorities. By session four it knows you well enough to draft in your voice.</p>
        <p class="best-for"><strong>Best for:</strong> technical or semi-technical founders who want hands-on learning while we install. Sessions 2–4 booked after Session 1 so we pace to your reality.</p>
      </div>
      <aside class="price-panel sticky">
        <p class="label">Price</p>
        <p class="value">$500</p>
        <p class="note">4 × 60-min sessions · credits toward EA Basic Build within 90 days</p>
        <a class="cta-primary" href="/book/coaching-block">Book + Pay →</a>
      </aside>
    </article>

    <!-- V3 — EA Basic Build rung -->
    <article class="rung-detail reveal-on-scroll" id="ea-basic-build">
      <div class="prose">
        <p class="eyebrow">EA Basic Build</p>
        <h2>I install your assistant. <em>One week, $2,000.</em></h2>
        <p>For founders who want the assistant installed quickly and don't want to be in the build process. We meet once at the start — I walk away with everything I need (your tools, your voice samples, your top three people, your current priorities). End of the week we meet again and your assistant is live in your stack.</p>
        <p class="best-for"><strong>Best for:</strong> non-technical founders who want the end state, not the building process. Two meetings total, asynchronous in between.</p>
      </div>
      <aside class="price-panel hero sticky">
        <span class="panel-badge">★ Most popular</span>
        <p class="label">Price</p>
        <p class="value">$2,000</p>
        <p class="note">One-week sprint · 2 meetings + async build</p>
        <a class="cta-primary" href="/book/ea-basic-build">Book + Pay →</a>
      </aside>
    </article>

    <!-- V4 — Layers rung -->
    <article class="rung-detail reveal-on-scroll" id="layers">
      <div class="prose">
        <p class="eyebrow">Layers</p>
        <h2>Capabilities, added async. <em>$500–$800 each.</em></h2>
        <p>After your assistant exists, capabilities stack. Want it to draft emails in your voice? Add a layer. Watch your calendar for conflicts and propose reschedules? Add a layer. Pull from your existing knowledge base and answer client questions? Add a layer. Each one is a small scoped engagement.</p>
        <p class="best-for"><strong>Best for:</strong> existing clients who've completed Coaching Block or EA Basic Build and want to extend the assistant's reach.</p>
      </div>
      <aside class="price-panel sticky">
        <p class="label">Price</p>
        <p class="value">$500–800</p>
        <p class="note">Per layer · async scoping + delivery</p>
        <a class="cta-secondary" href="mailto:cradsdavis@gmail.com?subject=Layer%20scope%20request">Email to scope a layer →</a>
      </aside>
    </article>

    <!-- V5 — Credit callout -->
    <div class="interlude credit-callout reveal-on-scroll" style="margin-top: var(--space-4);">
      <p><strong>Coaching credits</strong> apply to the EA Basic Build within 90 days. A $500 Coaching Block becomes $1,500 to complete the Basic Build — no penalty for starting small.</p>
    </div>

    <!-- V6 — Discovery card -->
    <div class="discovery-card reveal-on-scroll" id="discovery">
      <p class="eyebrow">Not sure which fits?</p>
      <h2>Start with a call.</h2>
      <span class="meta">30 min · free</span>
      <p>Discovery is free. Thirty minutes. I'll ask what you're trying to build, you'll ask what I do, and by the end one of three things is true: a rung above fits, you've got a smaller problem we can solve in a single session, or this isn't the right shape and I'll point you somewhere better.</p>
      <a class="cta-primary" href="/book/discovery">Book a Discovery call</a>
    </div>
  </section>
</main>

<footer class="site-footer wrap">
  <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  <div><a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a></div>
  <div><a href="https://linkedin.com/in/samuel-davis4" target="_blank" rel="noopener">linkedin.com/in/samuel-davis4</a></div>
  <div>+61 0493 302 154</div>
  <div class="location">Coogee, Sydney.</div>
</footer>

</body>
</html>
```

- [ ] **Step 2: Verify line count**

Run: `wc -l offer/index.html`
Expected: ~170-200 lines.

- [ ] **Step 3: Commit + push**

```bash
git add offer/index.html
git commit -m "feat(offer): v2 — upfront ladder + 3 per-rung 2-col layouts + credit callout + Discovery card"
git push
```

### Task 4.5: Mobile verification for /offer

- [ ] **Step 1: Vercel preview check**

Wait ~90s. Visit preview `/offer`. Verify:
- Hero unchanged
- Ladder-at-a-glance: 4 cards side-by-side desktop, wraps appropriately on mobile (auto-fit minmax 180px)
- Anchor links (#coaching-block etc) smooth-scroll to the per-rung articles (smooth-scroll JS already handles this from v1)
- Per-rung 2-col layouts (prose left, price-panel right) → stack to 1-col below 900px
- price-panel.sticky behaviour: on desktop, price panel stays in view as user scrolls past prose
- credit-callout renders with brass left border
- Discovery card centered, brass eyebrow, free meta

- [ ] **Step 2: Fix any issues**

- [ ] **Step 3: Commit empty verification**

```bash
git commit --allow-empty -m "test(offer): mobile + cross-browser verified"
git push
```

---

## Phase 5 · QA + Test Suite

### Task 5.1: Run existing test suite

**Files:**
- (No file changes; verification)

- [ ] **Step 1: Install + test**

```bash
cd c:/tmp/samdavis-site
npm install
npm test
```

Expected: all 18 tests pass (booking-status.test.js, checkout.test.js, webhook.test.js).

- [ ] **Step 2: If any test fails**

Verify `/api/**` and `/book/*` files were not modified: `git diff --stat main -- 'api/**' 'book/**'` should be empty.

- [ ] **Step 3: Commit verification**

```bash
git commit --allow-empty -m "test(phase-5): all 18 tests green post-v2-visual-restoration"
```

### Task 5.2: Lighthouse audit

**Files:**
- Create: `docs/superpowers/qa/2026-05-18-v2-lighthouse-results.md`

- [ ] **Step 1: Run Lighthouse on Vercel preview**

Open Chrome DevTools → Lighthouse. Run mobile + desktop on:
- `<preview-url>/`
- `<preview-url>/overview`
- `<preview-url>/offer`
- `<preview-url>/book`

Target: ≥95 on Performance, Accessibility, Best Practices, SEO.

- [ ] **Step 2: Fix any sub-95 metric**

Most likely failure modes for v2:
- **Performance:** mock-terminal has many small DOM updates during typewriter motion — verify no layout thrash. layer-grid + work-cards have stagger transitions; if these slow first-paint, cap them at 4-card stagger max.
- **Accessibility:** new components must have proper text contrast. `.rung-ladder .rung-card .r-name` is brass on bg-main; verify ≥4.5:1. `.builds-strip .build.hint` has opacity 0.7 — may need to lift contrast for AA.
- **SEO:** verify `<title>` and `<meta name="description">` on each page (they should already be set from v1 + the new rebuilds).

Fix + commit any issues with `fix(<page>): <description>`.

- [ ] **Step 3: Record final scores**

Write `docs/superpowers/qa/2026-05-18-v2-lighthouse-results.md`:

```markdown
# Lighthouse v2 audit · 2026-05-18 · feat/v2-visual-restoration-2026-05

| Page | Mobile P | Mobile A | Mobile BP | Mobile SEO | Desktop P | Desktop A | Desktop BP | Desktop SEO |
|---|---|---|---|---|---|---|---|---|
| / | XX | XX | XX | XX | XX | XX | XX | XX |
| /overview | XX | XX | XX | XX | XX | XX | XX | XX |
| /offer | XX | XX | XX | XX | XX | XX | XX | XX |
| /book | XX | XX | XX | XX | XX | XX | XX | XX |
```

Replace XX with actual scores.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/qa/2026-05-18-v2-lighthouse-results.md
git commit -m "test(qa): v2 Lighthouse audit recorded"
git push
```

### Task 5.3: WCAG AA contrast spot-check

**Files:**
- (No file changes typically; `lib/site.css` fixes if needed)

- [ ] **Step 1: Check critical contrast pairs**

Use WebAIM Contrast Checker for:
- `.builds-strip .build.hint` text color on `--bg-card`: 7C7050 on DCE0B6 at opacity 0.7 — verify still ≥4.5:1
- `.rung-ladder .rung-card .r-cta` brass-dashed underline visibility — should be ≥3:1 for non-text contrast
- `.price-panel .note` ink-soft on bg-soft: 6B5F3A on F2EEDD — verify ≥4.5:1
- `.callout-grid .callout .small` ink-soft on whatever background applies

- [ ] **Step 2: Fix any failing pair**

Most likely: `.builds-strip .build.hint` opacity 0.7 may fail. If so, change to `color: var(--ink-deep); opacity: 0.45` or remove opacity and use a lighter color value.

- [ ] **Step 3: Commit**

```bash
git add lib/site.css
git commit -m "fix(a11y): contrast bumps on .builds-strip / .price-panel where needed"
```

### Task 5.4: `prefers-reduced-motion` verification

- [ ] **Step 1: Enable OS reduced-motion**

Toggle OS-level reduced motion (Windows Settings → Accessibility → Visual effects → Animation effects OFF, or equivalent).

- [ ] **Step 2: Reload preview pages**

On `<preview-url>/overview`:
- Mock-terminal lines should appear instantly (all rows visible, no sequential reveal)
- Cursor should not blink
- Layer-grid stagger should be off (all cells fade-in together or instantly)
- Tier-stack reveal should be instant
- All hover state changes should still work

- [ ] **Step 3: Commit empty verification**

```bash
git commit --allow-empty -m "test(a11y): prefers-reduced-motion verified on v2"
```

### Task 5.5: Keyboard navigation + focus states

- [ ] **Step 1: Tab through each page**

For `/`, `/overview`, `/offer`:
- Tab from top — every interactive element (nav link, in-page anchor, CTA, rung card, work card) receives focus
- Verify visible focus indicator (brass outline from v1's `:focus-visible` if applied; if missing on new components, add)
- Tab order matches visual reading order

- [ ] **Step 2: Add focus styles if missing**

If new components (`.rung-card`, `.work-card`) lack visible focus, append to `lib/site.css`:

```css
.rung-ladder .rung-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 6px;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/site.css
git commit -m "fix(a11y): visible focus on .rung-card + .work-card"
git push
```

### Task 5.6: Real-device test

- [ ] **Step 1: iOS Safari**

On real iPhone, open preview. Walk:
- `/` → `/overview` → `/offer` → `/book/discovery`
- Verify all interludes render correctly
- Verify mock-terminal typewriter motion is smooth (or disabled if reduced-motion)
- Tap targets ≥44px

- [ ] **Step 2: Android Chrome**

Same on Android.

- [ ] **Step 3: Commit empty verification**

```bash
git commit --allow-empty -m "test(real-device): iOS Safari + Android Chrome verified"
git push
```

---

## Phase 6 · PR + Merge

### Task 6.1: Open PR via gh CLI or GitHub MCP

**Files:**
- (No file changes; PR opened)

- [ ] **Step 1: Push final commits**

```bash
git push
```

- [ ] **Step 2: Open PR**

Title: `v2 visual restoration · crads-ai.com`

Body:
```markdown
## Summary

Restoring the visual richness lost in the v1 boutique redesign. 12 reusable visual interludes added to `lib/site.css`; 3 pages rebuilt with the components interleaved into the existing prose flow.

- **`/overview`**: 8 visual interludes (layer-grid, tier-stack, self-portrait, reflex-cards, mock-terminal with typewriter motion, 2× callout-grids, tool-grid)
- **`/` (landing)**: 4 visual interludes (callouts, rung-ladder, work-cards with stats, builds-strip)
- **`/offer`**: 6 visual interludes (4-rung ladder at a glance, 3 per-rung price-panels, credit-callout, Discovery card)
- **`/book`, `/onepager`, `/build`, `/build-onepager`**: NOT TOUCHED. All 18 existing tests green.

## Verification

- ✅ All 18 existing tests green (`npm test`)
- ✅ Stripe + Cal integration files (`api/**`, `book/_slot-picker.js`) untouched
- ⏳ Lighthouse audit pending — target ≥95 on all metrics
- ⏳ WCAG AA contrast verified on new components
- ⏳ Keyboard nav + visible focus
- ⏳ `prefers-reduced-motion` disables typewriter + stagger
- ⏳ Real-device iOS + Android end-to-end

## Test plan

- [ ] User walks Vercel preview on desktop: /, /overview, /offer
- [ ] User walks on phone
- [ ] User confirms register matches the visual-rich boutique ambition (the v1 critique fixed)
- [ ] Book a Discovery slot end-to-end on phone

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Use `gh pr create` if installed, otherwise use GitHub MCP `mcp__github__create_pull_request`.

### Task 6.2: User reviews preview + approves

- [ ] **Step 1: User walks the preview URL**

User opens PR's Vercel preview link. Confirms:
- `/overview` is no longer pure prose — all 8 visual interludes present
- `/` (landing) feels structured, not text-heavy
- `/offer` has ladder-at-a-glance + price panels
- Visual register matches "boutique with diagrams" — the v1 critique resolved

- [ ] **Step 2: User comments verdict**

If ship → proceed to Task 6.3.
If changes requested → make changes, re-loop Phase 5 QA where affected, re-request review.

### Task 6.3: Squash-merge to main + tag

- [ ] **Step 1: Squash-merge PR**

Via GitHub MCP `mcp__github__merge_pull_request` (squash method), OR via GitHub UI "Squash and merge".

- [ ] **Step 2: Sync local main + tag**

```bash
git checkout main
git pull
git tag -a v2.0 -m "v2 — visual restoration · crads-ai.com"
git push --tags
```

- [ ] **Step 3: Delete feature branch**

```bash
git branch -d feat/v2-visual-restoration-2026-05
git push origin --delete feat/v2-visual-restoration-2026-05
```

- [ ] **Step 4: Smoke test production**

Open `https://crads-ai.com/` in incognito. Walk `/` → `/overview` → `/offer` → `/book`. Verify v2 register lands correctly.

---

## Self-Review Checklist

**1. Spec coverage:**
- ✓ All 12 components from spec component-map: shipped in Phase 2 (7 components for /overview) + Phase 3 (3 new: .work-cards, .builds-strip, .rung-ladder) + Phase 4 (2 new: .price-panel, .credit-callout)
- ✓ All 3 pages rebuilt: /overview (Task 2.9), / (Task 3.5), /offer (Task 4.4)
- ✓ Two bespoke motion treatments: layer-grid stagger (Task 1.2 stagger-grid + Task 2.3 layer-grid CSS) + typewriter terminal (Tasks 1.3 + 2.7)
- ✓ prefers-reduced-motion handled in lib/site.css (Tasks 1.1, 1.3, 2.7) + verified Task 5.4
- ✓ All 18 tests green check: Task 5.1
- ✓ Lighthouse ≥95: Task 5.2
- ✓ WCAG AA contrast: Task 5.3
- ✓ Keyboard nav + focus: Task 5.5
- ✓ Real-device: Task 5.6
- ✓ PR + tag v2.0: Task 6.1, 6.3

**2. Placeholder scan:**
- ✓ No TBDs, no "implement later", no "similar to Task N" without code
- ✓ All HTML and CSS shown in full per task
- ✓ Lighthouse template has XX placeholders but that's a results template, filled at audit time — explicit

**3. Type / class-name consistency:**
- ✓ `.callout-grid` defined Task 2.2; used in Task 2.9 (twice) + Task 3.5
- ✓ `.layer-grid` defined Task 2.3, used Task 2.9
- ✓ `.rung-ladder` + `.rung-card` + `.rung-card.hero` defined Task 3.4, used Task 3.5 + Task 4.4
- ✓ `.work-cards` + `.work` + `.glyph` + `.stat` defined Task 3.2, used Task 3.5
- ✓ `.builds-strip` + `.build.named` + `.build.hint` defined Task 3.3, used Task 3.5
- ✓ `.price-panel` + `.price-panel.hero` + `.price-panel.sticky` + `.panel-badge` defined Task 4.2, used Task 4.4
- ✓ `.credit-callout` defined Task 4.3, used Task 4.4
- ✓ `.tw-line`, `.tw-revealed` defined Task 1.3, used in `.mock-terminal` Task 2.7 + 2.9
- ✓ `.stagger-grid` foundation Task 1.1, JS auto-applies in Task 1.2, used throughout

No issues found. Plan is implementation-ready.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-crads-ai-v2-visual-restoration-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per phase (Phase 1 foundation, Phase 2 /overview, Phase 3 landing, Phase 4 /offer, Phase 5 QA), review between phases. Same pattern as v1.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints.

Which approach?
