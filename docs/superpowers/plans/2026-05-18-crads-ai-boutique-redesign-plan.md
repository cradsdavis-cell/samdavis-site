# crads-ai.com Boutique Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign crads-ai.com from "competent dev-built static site" to "strategy-boutique professional surface" comparable to anthropic.com / sequoiacap.com — across 5 founder-side pages + 2 demoted pages.

**Architecture:** Extract shared design tokens (palette/typography/spacing/motion) into `/lib/site.css` + `/lib/site.js`. Rebuild `/`, `/overview`, `/offer` in Anthropic-essay shape. CSS-swap only on `/book` (preserve Stripe + Cal integration). Palette + illustration swap on `/onepager`. Demote `/build`, `/build-onepager` from primary nav (URL-stable).

**Tech Stack:** Vanilla HTML/CSS/JS · Vercel serverless functions · Stripe Checkout · Cal API · Resend · Playfair Display + Inter (Google Fonts) · Nano Banana Edit 2 illustration.

**Source spec:** [`docs/superpowers/specs/2026-05-18-crads-ai-boutique-redesign-design.md`](../specs/2026-05-18-crads-ai-boutique-redesign-design.md)

**Branch:** `feat/boutique-redesign-2026-05`

**Production discipline:** Never push to `main` directly. Every commit goes on the feature branch. Vercel auto-deploys preview URLs from the branch. User approves final merge.

---

## File Structure

**Files to create:**
- `lib/site.css` — palette + typography + spacing + motion utilities (~250 lines)
- `lib/site.js` — italic morph + scroll observer + smooth anchor scroll (~50 lines vanilla JS)
- `lib/img/sam-illustration.png` — full-size optimised illustration (from Nano Banana Edit 2)
- `lib/img/sam-illustration-sm.png` — 320px-wide variant
- `lib/img/favicon.png` — 64×64 cropped icon mark
- `lib/img/favicon.ico` — multi-resolution ICO

**Files to fully rebuild:**
- `index.html` — landing page (essay shape)
- `overview/index.html` — EA demo (slide-deck → essay)
- `offer/index.html` — founder ladder (slide-deck → essay)

**Files to CSS-swap (no structural change):**
- `book/index.html` — preserve Stripe + Cal integration
- `book/_styles.css` — strip duplicated palette/typography, keep layout-specific styles
- `onepager/index.html` — palette + illustration swap, print-A4 dimensions unchanged
- `build/index.html` — shared-CSS adoption + nav demotion
- `build-onepager/index.html` — same as `/build`

**Files NOT to touch (out of scope, must remain green):**
- `api/**` — all serverless functions
- `package.json` — no new deps for this redesign
- `vercel.json` — already configured
- `tests/*.test.js` — must all pass post-merge

---

## Phase 0 · Branch Setup

### Task 0.1: Create feature branch

**Files:**
- Modify: git only

- [ ] **Step 1: Verify clean working tree**

Run: `cd c:/tmp/samdavis-site && git status`
Expected: `nothing to commit, working tree clean` (the spec was committed on main as 5f4ae09)

- [ ] **Step 2: Verify current branch is main**

Run: `git branch --show-current`
Expected: `main`

- [ ] **Step 3: Create + checkout feature branch**

Run: `git checkout -b feat/boutique-redesign-2026-05`
Expected: `Switched to a new branch 'feat/boutique-redesign-2026-05'`

- [ ] **Step 4: Push branch upstream**

Run: `git push -u origin feat/boutique-redesign-2026-05`
Expected: push success, branch tracking remote.

- [ ] **Step 5: Verify Vercel preview URL is registered**

Watch the GitHub PR-checks or Vercel dashboard for an auto-deploy URL. Note the URL — you'll review every commit against it.

---

## Phase 1 · Foundation

### Task 1.1: Create `lib/img/` directory + copy source illustration

**Files:**
- Create: `lib/img/` (directory)
- Create: `lib/img/sam-illustration-source.png` (copy from Nano Banana output)

- [ ] **Step 1: Create directory**

Run: `mkdir -p c:/tmp/samdavis-site/lib/img`

- [ ] **Step 2: Copy Nano Banana Edit 2 output as source asset**

Run: `cp c:/tmp/nano-edit-2-illustration-only.png c:/tmp/samdavis-site/lib/img/sam-illustration-source.png`
Verify: `ls -la c:/tmp/samdavis-site/lib/img/`
Expected: `sam-illustration-source.png` present, ~720KB.

- [ ] **Step 3: Commit**

```bash
git add lib/img/sam-illustration-source.png
git commit -m "feat(assets): add Nano Banana illustration source asset"
```

### Task 1.2: Optimise illustration variants

**Files:**
- Create: `lib/img/sam-illustration.png` (full-size, ~150-200KB target)
- Create: `lib/img/sam-illustration-sm.png` (320px wide)
- Create: `lib/img/favicon.png` (64×64 cropped to icon-only)

Note: no Python/Inkscape available; use ImageMagick `convert` (if installed) or sharp-cli via npx as fallback. Verify available tools first.

- [ ] **Step 1: Verify ImageMagick availability**

Run: `which convert 2>/dev/null || echo "ImageMagick not installed"`

If not installed, fall back to `npx sharp-cli` (no install needed, runs ephemerally).

- [ ] **Step 2: Generate full-size optimised PNG**

With ImageMagick:
```bash
cd c:/tmp/samdavis-site
convert lib/img/sam-illustration-source.png -resize 1200x -quality 85 -strip lib/img/sam-illustration.png
```

With sharp-cli (fallback):
```bash
npx --yes sharp-cli@latest -i lib/img/sam-illustration-source.png -o lib/img/sam-illustration.png --width 1200
```

Verify: `ls -la lib/img/sam-illustration.png` shows file <250KB.

- [ ] **Step 3: Generate small variant (320px wide)**

```bash
convert lib/img/sam-illustration-source.png -resize 320x -quality 85 -strip lib/img/sam-illustration-sm.png
```

Or sharp-cli:
```bash
npx --yes sharp-cli@latest -i lib/img/sam-illustration-source.png -o lib/img/sam-illustration-sm.png --width 320
```

Verify: file <50KB.

- [ ] **Step 4: Crop to icon-only favicon**

The Edit 2 image places the silhouette on the left, the tech-nature icon roughly center-right. Crop a square box around the icon. Approximate coordinates from the source: starts ~50% from left, ~25% from top, 35% width × 50% height.

```bash
convert lib/img/sam-illustration-source.png -crop 380x380+500+150 -resize 64x64 -quality 90 -strip lib/img/favicon.png
```

Or sharp-cli:
```bash
npx --yes sharp-cli@latest -i lib/img/sam-illustration-source.png -o lib/img/favicon.png --resize 64,64 --crop "500,150,880,530"
```

Visually verify: open `lib/img/favicon.png` — should show just the tech-nature icon, no silhouette visible. If the crop misses, adjust the offset values and retry. Document the exact command used.

- [ ] **Step 5: Generate ICO multi-resolution favicon**

```bash
convert lib/img/favicon.png -define icon:auto-resize=16,32,48 lib/img/favicon.ico
```

If ImageMagick unavailable, use [favicon.io](https://favicon.io/favicon-converter/) manually with `lib/img/favicon.png` as input, download the `.ico`, place at `lib/img/favicon.ico`.

Verify: `ls -la lib/img/` — four files present (source, full, sm, favicon.png, favicon.ico).

- [ ] **Step 6: Commit**

```bash
git add lib/img/sam-illustration.png lib/img/sam-illustration-sm.png lib/img/favicon.png lib/img/favicon.ico
git commit -m "feat(assets): generate illustration variants + favicon"
```

### Task 1.3: Create `lib/site.css` with palette + typography tokens

**Files:**
- Create: `lib/site.css`

- [ ] **Step 1: Write `lib/site.css` with palette + typography**

Create `c:/tmp/samdavis-site/lib/site.css`:

```css
/* ============================================================
   crads-ai.com · shared site CSS
   Imported by every page. Per-page CSS = overrides only.
   ============================================================ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,800;1,700;1,800&display=swap');

:root {
  /* Palette */
  --bg-main:     #FAF7EE;
  --bg-soft:     #F2EEDD;
  --bg-card:     #DCE0B6;
  --bg-card-hi:  #C8CEA0;
  --ink-deep:    #3E3418;
  --ink-soft:    #6B5F3A;
  --ink-faint:   #998D6B;
  --accent:      #8F7530;
  --accent-deep: #6B5624;
  --accent-bright: #B89B4A;
  --accent-glow: rgba(184, 155, 74, 0.22);
  --rule:        #B0B490;
  --good:        #7A8B3F;

  /* Type families */
  --serif: "Playfair Display", Georgia, "Times New Roman", serif;
  --sans:  "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --mono:  ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

  /* Spacing scale */
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 40px;
  --space-5: 72px;
  --space-6: 120px;
  --space-7: 200px;

  /* Wrappers */
  --wrap-max: 1100px;
  --read-col: 640px;
  --side-pad-desktop: 120px;
  --side-pad-tablet: 64px;
  --side-pad-mobile: 24px;
}

/* Reset */
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: var(--bg-main);
  color: var(--ink-deep);
  font-family: var(--sans);
  font-size: 18px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  min-height: 100vh;
}

/* Typography */
h1, h2, h3, h4 {
  font-family: var(--serif);
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.1;
  color: var(--ink-deep);
}

h1 {
  font-size: clamp(40px, 6vw, 72px);
  line-height: 1.05;
  letter-spacing: -0.015em;
}

h1 em, h2 em, h3 em {
  color: var(--accent);
  font-style: italic;
  font-weight: 700;
}

h2 {
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.1;
  letter-spacing: -0.01em;
}

h3 {
  font-size: clamp(22px, 2.2vw, 28px);
  font-weight: 700;
  letter-spacing: -0.005em;
}

p {
  font-size: 18px;
  line-height: 1.65;
  color: var(--ink-deep);
}

.lede {
  font-size: clamp(18px, 1.6vw, 23px);
  line-height: 1.5;
  color: var(--ink-soft);
  max-width: var(--read-col);
}

.eyebrow {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
}

.meta {
  font-family: var(--mono);
  font-size: 13px;
  letter-spacing: 0.05em;
  color: var(--ink-faint);
}

a {
  color: var(--accent);
  text-decoration: none;
  transition: color 0.2s ease;
}
a:hover { color: var(--accent-deep); }
```

- [ ] **Step 2: Open `c:/tmp/samdavis-site/index.html` in browser**

Don't link `lib/site.css` yet. Just verify the file exists.

Run: `ls -la c:/tmp/samdavis-site/lib/site.css`
Expected: file present, >2KB.

- [ ] **Step 3: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): palette + typography tokens in shared lib/site.css"
```

### Task 1.4: Add spacing + layout utilities to `lib/site.css`

**Files:**
- Modify: `lib/site.css`

- [ ] **Step 1: Append spacing + layout utilities**

Append to `c:/tmp/samdavis-site/lib/site.css`:

```css

/* ============================================================
   Layout utilities
   ============================================================ */

.wrap {
  max-width: var(--wrap-max);
  margin: 0 auto;
  padding: 0 var(--side-pad-desktop);
}

.read-col {
  max-width: var(--read-col);
}

.section {
  padding: var(--space-6) 0;
}

.section + .section {
  border-top: 1px solid var(--rule);
}

.section-tight { padding: var(--space-5) 0; }

/* CTAs */
.cta-primary {
  display: inline-block;
  background: var(--accent);
  color: var(--bg-main);
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  padding: 14px 26px;
  border-radius: 4px;
  transition: background 0.2s ease, transform 0.2s ease;
  border: none;
}
.cta-primary::after {
  content: " →";
  display: inline-block;
  transition: transform 0.2s ease;
}
.cta-primary:hover {
  background: var(--accent-deep);
  color: var(--bg-main);
}
.cta-primary:hover::after { transform: translateX(6px); }

.cta-secondary {
  display: inline-block;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--ink-soft);
  border-bottom: 1px dashed var(--ink-faint);
  padding-bottom: 2px;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.cta-secondary:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* Nav */
.site-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--side-pad-desktop);
  border-bottom: 1px solid var(--rule);
  background: var(--bg-main);
}

.site-nav-bar .brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.site-nav-bar .brand img {
  height: 36px;
  width: auto;
}
.site-nav-bar .brand .wordmark {
  font-family: var(--serif);
  font-size: 22px;
  font-weight: 800;
  color: var(--ink-deep);
  letter-spacing: -0.015em;
}
.site-nav-bar .brand .wordmark .accent {
  color: var(--accent);
  font-style: italic;
  font-weight: 700;
}

.site-nav-bar .nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--sans);
  font-size: 14.5px;
}
.site-nav-bar .nav-links a {
  color: var(--ink-soft);
  padding: 6px 10px;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
}
.site-nav-bar .nav-links a:hover {
  color: var(--accent);
  background: var(--bg-soft);
}
.site-nav-bar .nav-links a.current {
  color: var(--ink-deep);
  font-weight: 600;
}

/* Footer */
.site-footer {
  padding: var(--space-5) 0 var(--space-5);
  border-top: 1px solid var(--rule);
  font-family: var(--mono);
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 2;
}
.site-footer .wordmark {
  font-family: var(--serif);
  font-size: 26px;
  font-weight: 800;
  color: var(--ink-deep);
  letter-spacing: -0.015em;
  margin-bottom: var(--space-3);
  display: block;
}
.site-footer .wordmark .accent {
  color: var(--accent);
  font-style: italic;
  font-weight: 700;
}
.site-footer a {
  color: var(--ink-deep);
  border-bottom: 1px dashed var(--ink-faint);
}
.site-footer a:hover { border-bottom-color: var(--accent); }
.site-footer .location {
  margin-top: var(--space-3);
  color: var(--ink-faint);
  font-family: var(--sans);
  font-size: 13.5px;
  font-style: italic;
}

/* Responsive */
@media (max-width: 1100px) {
  .wrap { padding: 0 var(--side-pad-tablet); }
  .site-nav-bar { padding: var(--space-3) var(--side-pad-tablet); }
}
@media (max-width: 900px) {
  .section { padding: var(--space-5) 0; }
}
@media (max-width: 600px) {
  html, body { font-size: 16px; }
  .wrap { padding: 0 var(--side-pad-mobile); }
  .site-nav-bar { padding: var(--space-2) var(--side-pad-mobile); flex-wrap: wrap; }
  .site-nav-bar .nav-links { font-size: 13px; gap: 4px; }
  .section { padding: 56px 0; }
  .cta-primary { width: 100%; text-align: center; padding: 16px 24px; }
}
```

- [ ] **Step 2: Verify file size**

Run: `wc -l c:/tmp/samdavis-site/lib/site.css`
Expected: ~220-260 lines.

- [ ] **Step 3: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): spacing + nav + footer + CTA utilities + responsive breakpoints"
```

### Task 1.5: Add motion utility classes to `lib/site.css`

**Files:**
- Modify: `lib/site.css`

- [ ] **Step 1: Append motion classes**

Append to `c:/tmp/samdavis-site/lib/site.css`:

```css

/* ============================================================
   Motion utilities
   ============================================================ */

/* Float — used on landing hero illustration */
@keyframes float-gentle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.float-gentle {
  animation: float-gentle 4s ease-in-out infinite;
}

/* Italic morph wrapper — JS-driven crossfade */
.italic-morph {
  display: inline-block;
  position: relative;
  min-width: 0.5em;
}
.italic-morph .phrase {
  font-style: italic;
  color: var(--accent);
  font-weight: 700;
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.italic-morph .phrase.exiting {
  opacity: 0;
  transform: translateY(-6px);
}
.italic-morph .phrase.entering {
  opacity: 0;
  transform: translateY(6px);
}

/* Scroll reveal — JS toggles .revealed when in viewport */
.reveal-on-scroll {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}
.reveal-on-scroll.revealed {
  opacity: 1;
  transform: translateY(0);
}

/* Stagger children — set --reveal-index on each child */
.reveal-on-scroll[style*="--reveal-index"] {
  transition-delay: calc(var(--reveal-index) * 80ms);
}

/* prefers-reduced-motion — kill animations, retain hover state changes */
@media (prefers-reduced-motion: reduce) {
  .float-gentle { animation: none; }
  .italic-morph .phrase { transition: none; }
  .reveal-on-scroll {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.css
git commit -m "feat(css): motion utilities (float, italic-morph, reveal-on-scroll) + reduced-motion"
```

### Task 1.6: Create `lib/site.js`

**Files:**
- Create: `lib/site.js`

- [ ] **Step 1: Write `lib/site.js`**

Create `c:/tmp/samdavis-site/lib/site.js`:

```javascript
// ============================================================
// crads-ai.com · shared site JS
// Italic morph + scroll observer + smooth anchor scroll.
// Imported as <script defer src="/lib/site.js"></script>
// ============================================================

(function () {
  'use strict';

  // ---------- Italic morph ----------
  // Looks for elements like:
  //   <span class="italic-morph" data-phrases="a|b|c">a</span>
  // Cycles through phrases on a 4s interval with crossfade.
  function initItalicMorph() {
    document.querySelectorAll('.italic-morph').forEach((el) => {
      const phrasesAttr = el.getAttribute('data-phrases') || '';
      const phrases = phrasesAttr.split('|').map(s => s.trim()).filter(Boolean);
      if (phrases.length < 2) return;

      const phraseEl = document.createElement('span');
      phraseEl.className = 'phrase';
      phraseEl.textContent = phrases[0];
      el.textContent = '';
      el.appendChild(phraseEl);

      let i = 0;
      setInterval(() => {
        i = (i + 1) % phrases.length;
        phraseEl.classList.add('exiting');
        setTimeout(() => {
          phraseEl.textContent = phrases[i];
          phraseEl.classList.remove('exiting');
          phraseEl.classList.add('entering');
          // Reflow before removing entering class
          // eslint-disable-next-line no-unused-expressions
          phraseEl.offsetWidth;
          phraseEl.classList.remove('entering');
        }, 600);
      }, 4000);
    });
  }

  // ---------- Scroll reveal ----------
  // Observes elements with .reveal-on-scroll, adds .revealed when they enter viewport.
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

  // ---------- Smooth anchor scroll ----------
  // Catches clicks on internal #anchor links and smooth-scrolls.
  function initSmoothScroll() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL hash without jump
      history.pushState(null, '', '#' + id);
    });
  }

  // ---------- Init ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initItalicMorph();
      initScrollReveal();
      initSmoothScroll();
    });
  } else {
    initItalicMorph();
    initScrollReveal();
    initSmoothScroll();
  }
})();
```

- [ ] **Step 2: Verify file size**

Run: `wc -l c:/tmp/samdavis-site/lib/site.js`
Expected: ~70-80 lines.

- [ ] **Step 3: Commit**

```bash
git add lib/site.js
git commit -m "feat(js): italic morph + scroll observer + smooth anchor scroll"
```

### Task 1.7: Phase 1 preview — verify shared CSS imports cleanly

**Files:**
- (No production files modified — temporary import for smoke test)

- [ ] **Step 1: Add temporary smoke-test HTML at lib/_smoke.html**

Create `c:/tmp/samdavis-site/lib/_smoke.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Smoke test · lib/site.css + lib/site.js</title>
<link rel="stylesheet" href="/lib/site.css">
<script defer src="/lib/site.js"></script>
</head>
<body>
<nav class="site-nav-bar">
  <div class="brand">
    <img src="/lib/img/sam-illustration-sm.png" alt="Sam Davis illustration">
    <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  </div>
  <div class="nav-links">
    <a href="/" class="current">Home</a>
    <a href="/overview">Overview</a>
    <a href="/offer">Offer</a>
    <a href="/book">Book →</a>
  </div>
</nav>
<main class="wrap">
  <section class="section">
    <p class="eyebrow">SAM DAVIS · 8 BUILDS IN 12 MONTHS</p>
    <h1>An AI executive assistant that <span class="italic-morph" data-phrases="chief of staff|longtime colleague|thoughtful editor">chief of staff</span> would.</h1>
    <p class="lede">If you can read this, the shared CSS + JS are wired in correctly.</p>
    <a class="cta-primary" href="#test">Smoke test CTA</a>
    <a class="cta-secondary" href="#more">Secondary action</a>
  </section>
  <section class="section reveal-on-scroll">
    <h2>Section two — should fade in</h2>
    <p>Scroll-reveal sanity check. If this section faded in as you scrolled, IntersectionObserver is working.</p>
  </section>
</main>
<footer class="site-footer wrap">
  <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  <div><a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a></div>
  <div class="location">Coogee, Sydney.</div>
</footer>
</body>
</html>
```

- [ ] **Step 2: Push branch + open Vercel preview**

Run:
```bash
cd c:/tmp/samdavis-site
git add lib/_smoke.html
git commit -m "chore(smoke): temporary smoke test for shared CSS+JS"
git push
```

Wait ~60-90s for Vercel preview deploy. Open the preview URL + navigate to `/lib/_smoke.html`.

- [ ] **Step 3: Manual verify**

In the browser at `<preview-url>/lib/_smoke.html`:
- Nav bar renders with illustration thumbnail + "Sam Davis." wordmark
- Eyebrow text is uppercase, mono, brass color
- H1 uses Playfair Display 800
- Italic-morph cycles through 3 phrases on 4s loop
- Primary CTA is solid brass + arrow nudges on hover
- Secondary CTA is dashed underline + brass on hover
- Scrolling to section 2 fades it in

If any item fails, fix it in `lib/site.css` or `lib/site.js`, recommit, push, recheck.

- [ ] **Step 4: Delete smoke file + commit**

```bash
rm c:/tmp/samdavis-site/lib/_smoke.html
git add -A lib/_smoke.html
git commit -m "chore(smoke): remove smoke test file"
```

**Phase 1 complete.** Vercel preview is the QA gate; user can review the foundation before Phase 2 starts.

---

## Phase 2 · Landing Page Rebuild

### Task 2.1: Backup current `index.html`

**Files:**
- Modify: filesystem (move)
- Create: `index-pre-redesign.html.bak`

- [ ] **Step 1: Backup**

```bash
cd c:/tmp/samdavis-site
cp index.html index-pre-redesign.html.bak
```

- [ ] **Step 2: Verify backup**

Run: `diff index.html index-pre-redesign.html.bak`
Expected: no output (files identical).

- [ ] **Step 3: Commit backup**

```bash
git add index-pre-redesign.html.bak
git commit -m "chore: backup pre-redesign index.html for rollback reference"
```

### Task 2.2: Stub new `index.html` with shared CSS+JS imports

**Files:**
- Modify: `index.html` (full rewrite)

- [ ] **Step 1: Replace `index.html` with skeleton**

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
  <!-- Hero (Task 2.3) -->
  <!-- How I work (Task 2.5) -->
  <!-- Selected work (Task 2.6) -->
  <!-- Final CTA (Task 2.7) -->
</main>

<footer class="site-footer wrap">
  <!-- Footer (Task 2.8) -->
</footer>

</body>
</html>
```

- [ ] **Step 2: Visual smoke test**

Open the file locally via `start chrome c:/tmp/samdavis-site/index.html` or push + check Vercel preview.
Expected: blank page with nav bar rendered correctly.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "refactor(index): scaffold new index.html with shared CSS+JS imports"
```

### Task 2.3: Build hero section

**Files:**
- Modify: `index.html` (replace `<!-- Hero -->` comment with content)

- [ ] **Step 1: Insert hero markup**

Replace `<!-- Hero (Task 2.3) -->` in `index.html` with:

```html
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
```

- [ ] **Step 2: Add hero-specific CSS at bottom of `index.html` `<head>`**

After `<script defer src="/lib/site.js"></script>` in `<head>`, add:

```html
<style>
  .hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: var(--space-5);
    padding-top: var(--space-7);
    padding-bottom: var(--space-6);
  }
  .hero-illustration img {
    width: 100%;
    max-width: 480px;
    height: auto;
  }
  .hero-copy h1 { margin: var(--space-3) 0; }
  .hero-copy .lede { margin-bottom: var(--space-4); }
  .hero-ctas {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }
  .hero-proof {
    font-size: 15px;
    color: var(--ink-faint);
    line-height: 1.5;
    max-width: 540px;
  }
  .hero-proof em { font-style: italic; }
  @media (max-width: 900px) {
    .hero {
      grid-template-columns: 1fr;
      padding-top: var(--space-5);
      padding-bottom: var(--space-5);
      gap: var(--space-3);
    }
    .hero-illustration { order: -1; max-width: 240px; margin: 0 auto; }
  }
  @media (max-width: 600px) {
    .hero-ctas { flex-direction: column; align-items: stretch; }
    .hero-ctas .cta-secondary { text-align: center; }
  }
</style>
```

- [ ] **Step 3: Browser verify**

Push + open Vercel preview. Visit `/`.
Expected:
- Two-column hero on desktop (illustration left, copy right)
- Single-column stacked on mobile (illustration above copy)
- Italic word morphs through 3 phrases on 4s loop
- Primary CTA brass, arrow nudges on hover
- Secondary text-link dashed underline
- Illustration floats gently

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(index): hero section with italic morph + paired illustration"
```

### Task 2.4: Build "How I work" prose section

**Files:**
- Modify: `index.html` (replace `<!-- How I work -->` placeholder)

- [ ] **Step 1: Insert "How I work" markup**

Replace `<!-- How I work (Task 2.5) -->` with:

```html
  <section class="section wrap" id="how">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">How I work</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">Three rungs. <em>Start anywhere.</em></h2>
      <p class="reveal-on-scroll" style="--reveal-index: 2">Most founders begin with a <strong>Coaching Block</strong> — four sessions over a few weeks, $500. We build alongside each other: your AI executive assistant gets installed into your workflow, with you, in real time. By session four it knows you well enough to write in your voice.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 3">If you want it installed faster, the <strong>EA Basic Build</strong> — $2,000 fixed, one week — is the "I'll do it for you" option. End of the week, you have an assistant that knows your people, your priorities, and how you write. We meet once at the start and once at the end.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 4">After either of those, <strong>Layers</strong> come async — $500–$800 per capability. Want it to draft emails? Add a layer. Watch your calendar for conflicts? Add a layer. Pull from your existing knowledge base? Add a layer. Each one stacks.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 5"><a class="cta-secondary" href="/offer">See the full offer →</a></p>
    </div>
  </section>
```

- [ ] **Step 2: Browser verify**

Preview the section.
Expected: prose section reads in single column (640px max-width), eyebrow + H2 + 4 paragraphs + secondary CTA. Scroll reveals fade in with stagger.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(index): How-I-work prose section with scroll-reveal stagger"
```

### Task 2.5: Build "Selected work" prose section

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Insert "Selected work" markup**

Replace `<!-- Selected work (Task 2.6) -->` with:

```html
  <section class="section wrap" id="work">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">Selected work</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">Eight AI systems shipped in twelve months.</h2>

      <div class="work-entry reveal-on-scroll" style="--reveal-index: 2">
        <h3>Carbon Tracker</h3>
        <p>An eleven-agent system built for a UK climate consultancy in around six weeks. The agents triage incoming carbon-accounting questions across multiple Scope-3 frameworks, cross-check against the client's historical decisions, and surface the answers with auditable reasoning. The system replaced a process that previously took the consultancy three days per client; the agentic pipeline does it in under twenty minutes.</p>
      </div>

      <div class="work-entry reveal-on-scroll" style="--reveal-index: 3">
        <h3>Derwen</h3>
        <p>A live AI biodiversity assistant. Reads a habitat description, recommends species, surfaces evidence from peer-reviewed literature. Built in two weeks as a working demo of "AI as conservation translator." Live at <a href="https://derwenai.replit.app" target="_blank" rel="noopener">derwenai.replit.app</a>.</p>
      </div>

      <div class="work-entry reveal-on-scroll" style="--reveal-index: 4">
        <h3>This system</h3>
        <p>The AI executive assistant that runs this site, drafts these words, tracks every conversation I have with a client. Built layer by layer over a year. I demo it live on prospect calls — easier than explaining what an EA-with-real-context actually means.</p>
      </div>

      <p class="reveal-on-scroll work-closing" style="--reveal-index: 5">Five more builds rounded out the twelve months — a second-hand gear finder, a wildlife-monitoring system, climate-data tooling. Happy to walk through any of them on a call.</p>
    </div>
  </section>
```

- [ ] **Step 2: Add work-entry styles to the `<style>` block in `<head>`**

Append inside the existing `<style>` block:

```css
  .work-entry {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--rule);
  }
  .work-entry:last-of-type { border-bottom: none; }
  .work-entry h3 { margin-bottom: var(--space-2); }
  .work-entry p { color: var(--ink-soft); }
  .work-closing {
    margin-top: var(--space-3);
    color: var(--ink-soft);
    font-style: italic;
  }
```

- [ ] **Step 3: Browser verify**

Preview.
Expected: three "Selected work" entries stack vertically with thin dividers. Each scroll-reveals with stagger. Final closing paragraph is italic + muted.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(index): Selected-work section with three case-study entries"
```

### Task 2.6: Build "Final CTA" section

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Final CTA (Task 2.7) -->` with:

```html
  <section class="section section-tight wrap" id="final-cta">
    <div class="read-col">
      <h2 class="reveal-on-scroll" style="--reveal-index: 0">If any of this is the shape of what you've been trying to build —</h2>
      <p class="lede reveal-on-scroll" style="--reveal-index: 1">Book a thirty-minute call. No pitch.</p>
      <a class="cta-primary reveal-on-scroll" style="--reveal-index: 2" href="/book">Book a 30-minute call</a>
    </div>
  </section>
```

- [ ] **Step 2: Browser verify**

Preview. Section sits at the bottom, generous whitespace.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(index): final CTA section"
```

### Task 2.7: Build footer

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Insert footer markup**

Replace the `<!-- Footer (Task 2.8) -->` block AND the surrounding `<footer>` tags with:

```html
<footer class="site-footer wrap">
  <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  <div><a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a></div>
  <div><a href="https://linkedin.com/in/samuel-davis4" target="_blank" rel="noopener">linkedin.com/in/samuel-davis4</a></div>
  <div>+61 0493 302 154</div>
  <div class="location">Coogee, Sydney.</div>
</footer>
```

- [ ] **Step 2: Browser verify**

Preview. Footer sits at bottom: wordmark, three contact lines, italic Coogee location. Borders consistent with rest of page.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(index): footer with contact + location (no Wellington broadcast)"
```

### Task 2.8: Landing mobile pass + cross-browser QA

**Files:**
- (Possibly minor CSS tweaks based on findings)

- [ ] **Step 1: Local mobile-emulator test**

Open Vercel preview URL in Chrome DevTools, toggle device emulator. Test at:
- iPhone 12 Pro (390×844)
- iPad Pro (1024×1366)
- Galaxy S20 (412×915)

Verify:
- Hero stacks (illustration above copy) below 900px
- CTAs become full-width below 600px
- Side padding reduces to 24px on mobile
- No horizontal scrollbar at any breakpoint
- Italic morph still cycles on mobile
- Scroll reveals trigger correctly

- [ ] **Step 2: Real-device test**

Open Vercel preview on actual iOS Safari (any iPhone) and Android Chrome. Confirm:
- Float animation runs smoothly (no jank)
- All taps register on CTAs and links
- Tap targets feel ≥44px

If issues found, fix in inline `<style>` block and commit with prefix `fix(index): mobile <description>`.

- [ ] **Step 3: Desktop cross-browser test**

Open preview in:
- Chrome (latest)
- Firefox (latest)
- Safari (if Mac available; skip if not)

Verify visual parity. Float animation works in all three. Italic morph works in all three.

- [ ] **Step 4: Commit any fixes; otherwise note "no fixes needed" in branch log**

```bash
git add index.html
git commit -m "fix(index): mobile QA pass (or: 'docs: mobile QA pass - no fixes needed')"
```

**Phase 2 complete.** Landing page is live on Vercel preview. User reviews preview before Phase 3 starts.

---

## Phase 3 · `/overview` Restructure (slide-deck → essay)

### Task 3.1: Backup current `/overview`

**Files:**
- Create: `overview/index-pre-redesign.html.bak`

- [ ] **Step 1: Backup**

```bash
cd c:/tmp/samdavis-site
cp overview/index.html overview/index-pre-redesign.html.bak
```

- [ ] **Step 2: Commit backup**

```bash
git add overview/index-pre-redesign.html.bak
git commit -m "chore(overview): backup slide-deck version pre-redesign"
```

### Task 3.2: Write new `overview/index.html` essay skeleton

**Files:**
- Modify: `overview/index.html` (full rewrite)

- [ ] **Step 1: Replace with essay structure**

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

  <!-- Sections (Task 3.3-3.7) -->
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

- [ ] **Step 2: Verify nav renders + hero shows**

Push + check preview.

- [ ] **Step 3: Commit**

```bash
git add overview/index.html
git commit -m "refactor(overview): scaffold essay-shape skeleton (replaces slide-deck)"
```

### Task 3.3: Build "It knows me" section

**Files:**
- Modify: `overview/index.html`

- [ ] **Step 1: Insert markup before `<!-- Sections -->` comment**

Replace `<!-- Sections (Task 3.3-3.7) -->` with the first section, leaving the comment in place for subsequent sections:

```html
  <section class="section wrap" id="knows-me">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">§ It knows me</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">Context, not prompts.</h2>
      <p class="reveal-on-scroll" style="--reveal-index: 2">A generic AI assistant is a stranger you brief every time. The thing I build instead is a long-term context layer: <em>who you are, what you care about right now, what you're trying to build, and the eight layers of knowledge that change rarely.</em> When you ask it something, it doesn't start from zero. It starts from a year of you.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 3">The layers are deliberate — North Star, Philosophy, Self, Network, Past, Goals, Tasks, Workflow. Each one is a single source of truth. The assistant pulls from them when relevant. You don't paste your bio into every prompt.</p>
    </div>
  </section>

  <!-- Sections (Task 3.4 onwards) -->
```

- [ ] **Step 2: Browser verify**

Section renders below hero with scroll-reveal stagger.

- [ ] **Step 3: Commit**

```bash
git add overview/index.html
git commit -m "feat(overview): 'It knows me' context section"
```

### Task 3.4: Build "It knows my people" section

**Files:**
- Modify: `overview/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Sections (Task 3.4 onwards) -->` with:

```html
  <section class="section wrap" id="knows-people">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">§ It knows my people</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">A network, tiered.</h2>
      <p class="reveal-on-scroll" style="--reveal-index: 2">Every person who matters has a page — what you've talked about, what they're working on, how often you should be in touch, what the next ask might be. Tiered: <em>core</em> (family + chosen-family), <em>live</em> (active threads), <em>warm</em> (alive but slower), <em>dormant</em>, <em>stub</em>.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 3">When a name comes up in conversation, the assistant already knows the relationship history. It catches when you haven't pinged someone in two weeks and they're a "live" thread. It drafts outreach in your voice, with the right context, at the right altitude for the relationship.</p>
    </div>
  </section>

  <!-- Sections (Task 3.5 onwards) -->
```

- [ ] **Step 2: Verify + commit**

```bash
git add overview/index.html
git commit -m "feat(overview): 'It knows my people' network-tier section"
```

### Task 3.5: Build "It writes in my voice" section

**Files:**
- Modify: `overview/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Sections (Task 3.5 onwards) -->` with:

```html
  <section class="section wrap" id="writes-in-voice">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">§ It writes in my voice</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">Concrete. Vulnerable. <em>Yours.</em></h2>
      <p class="reveal-on-scroll" style="--reveal-index: 2">Generic AI output is detectable in three seconds — em-dashes everywhere, "delve into" everything, every sentence the same length. I build a voice profile from your actual writing: signature phrases, sentence rhythms, the things you don't say. The assistant runs every outbound draft through a seven-check audit before it shows you anything.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 3">When a draft sounds like a LinkedIn post, it gets flagged. When it crosses into corporate-fluent register, it gets rewritten. The first draft you see already sounds like you.</p>
      <!-- TODO when Abbey permission lands: testimonial card here -->
    </div>
  </section>

  <!-- Sections (Task 3.6 onwards) -->
```

- [ ] **Step 2: Verify + commit**

```bash
git add overview/index.html
git commit -m "feat(overview): 'It writes in my voice' section (Abbey quote slot pending permission)"
```

### Task 3.6: Build "It catches drift" section

**Files:**
- Modify: `overview/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Sections (Task 3.6 onwards) -->` with:

```html
  <section class="section wrap" id="catches-drift">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">§ It catches drift</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">Working memory, not a filing cabinet.</h2>
      <p class="reveal-on-scroll" style="--reveal-index: 2">The assistant updates the wiki as conversation surfaces material — a new person mentioned, a decision stated, a priority shift. These trigger silent edits: a person page gets bumped, a decision lands in the log, a stale fact gets flagged for review.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 3">A daily lint catches drift — schema violations, stale pages, broken references. A weekly sync reconciles your goals against the active projects. Coherence isn't something you maintain. It's something the system surfaces when it slips.</p>
    </div>
  </section>

  <!-- Sections (Task 3.7 onwards) -->
```

- [ ] **Step 2: Verify + commit**

```bash
git add overview/index.html
git commit -m "feat(overview): 'It catches drift' lint + sync section"
```

### Task 3.7: Build "It uses the right tool" section

**Files:**
- Modify: `overview/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Sections (Task 3.7 onwards) -->` with:

```html
  <section class="section wrap" id="right-tool">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">§ It uses the right tool for the job</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">Skills + connectors.</h2>
      <p class="reveal-on-scroll" style="--reveal-index: 2">The assistant has named skills — short workflows for specific tasks. Open a session. Outreach. Draft a follow-up. Audit the inbox. Each one is a small set of steps that knows when to fire, what tools to use, and what to write back.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 3">It connects to Gmail, Calendar, Todoist, WhatsApp, GitHub, Drive — whatever your operational surface actually is. The assistant lives in the tools you already use, not in a new app you have to remember to open.</p>
    </div>
  </section>

  <!-- Sections (Task 3.8 onwards) -->
```

- [ ] **Step 2: Verify + commit**

```bash
git add overview/index.html
git commit -m "feat(overview): 'It uses the right tool' skills + MCPs section"
```

### Task 3.8: Embed Carbon Tracker case study

**Files:**
- Modify: `overview/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Sections (Task 3.8 onwards) -->` with:

```html
  <section class="section wrap" id="carbon-tracker">
    <div class="read-col">
      <p class="eyebrow reveal-on-scroll" style="--reveal-index: 0">§ Case study · Carbon Tracker</p>
      <h2 class="reveal-on-scroll" style="--reveal-index: 1">Eleven agents. <em>Six weeks.</em></h2>
      <p class="reveal-on-scroll" style="--reveal-index: 2">A UK climate consultancy was spending three days per client triaging Scope-3 carbon-accounting questions across multiple frameworks. The framework-mapping was rote, the cross-referencing was painful, and every analyst had a slightly different opinion about how it should be done.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 3">I designed an eleven-agent pipeline that triages incoming questions, decides which carbon framework applies, cross-checks against the consultancy's historical decisions, and surfaces an auditable chain of reasoning. Each agent has one job. Each handoff is logged. The output is a document the analyst reviews and signs off, not replaces.</p>
      <p class="reveal-on-scroll" style="--reveal-index: 4">Time-to-answer dropped from three days to under twenty minutes. The system shipped in around six weeks. The consultancy now uses it as the first-pass on every client engagement.</p>
    </div>
  </section>

  <section class="section section-tight wrap" id="overview-cta">
    <div class="read-col">
      <h2 class="reveal-on-scroll" style="--reveal-index: 0">Want to see one of these run live?</h2>
      <p class="lede reveal-on-scroll" style="--reveal-index: 1">Book a thirty-minute call. I'll demo the system that runs this site.</p>
      <a class="cta-primary reveal-on-scroll" style="--reveal-index: 2" href="/book">Book a 30-minute call</a>
    </div>
  </section>
```

- [ ] **Step 2: Verify + mobile pass**

Push + open preview. Cycle through sections at desktop + mobile. Scroll reveals fire correctly. Anchor links (`#carbon-tracker` etc.) smooth-scroll.

- [ ] **Step 3: Commit**

```bash
git add overview/index.html
git commit -m "feat(overview): Carbon Tracker case study + closing CTA"
```

**Phase 3 complete.**

---

## Phase 4 · `/offer` Restructure

### Task 4.1: Backup current `/offer`

**Files:**
- Create: `offer/index-pre-redesign.html.bak`

- [ ] **Step 1: Backup + commit**

```bash
cd c:/tmp/samdavis-site
cp offer/index.html offer/index-pre-redesign.html.bak
git add offer/index-pre-redesign.html.bak
git commit -m "chore(offer): backup slide-deck version pre-redesign"
```

### Task 4.2: Write new `offer/index.html` essay skeleton

**Files:**
- Modify: `offer/index.html` (full rewrite)

- [ ] **Step 1: Replace with skeleton**

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
    padding-bottom: var(--space-5);
  }
  .offer-hero img { width: 140px; height: auto; }
  .rung {
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--rule);
  }
  .rung:last-of-type { border-bottom: none; }
  .rung .meta {
    display: block;
    margin: var(--space-2) 0 var(--space-3);
  }
  .rung-cta { margin-top: var(--space-3); }
  @media (max-width: 900px) {
    .offer-hero { grid-template-columns: 1fr; }
    .offer-hero img { margin: 0 auto; }
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
  <section class="offer-hero wrap">
    <img src="/lib/img/sam-illustration.png" alt="" class="float-gentle">
    <div>
      <p class="eyebrow">Offer</p>
      <h1>How we <em>work together.</em></h1>
    </div>
  </section>

  <!-- Rungs (Task 4.3-4.6) -->
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

- [ ] **Step 2: Commit**

```bash
git add offer/index.html
git commit -m "refactor(offer): scaffold essay-shape skeleton (replaces slide-deck)"
```

### Task 4.3: Build Coaching Block rung

**Files:**
- Modify: `offer/index.html`

- [ ] **Step 1: Replace `<!-- Rungs (Task 4.3-4.6) -->` with first rung**

```html
  <section class="section wrap">
    <div class="read-col">

      <article class="rung reveal-on-scroll" id="coaching-block">
        <p class="eyebrow">Coaching Block</p>
        <h2>Build alongside me. <em>Four sessions, $500.</em></h2>
        <span class="meta">4 × 60 min · $500 AUD ($125/session)</span>
        <p>For founders who want the assistant installed into their actual workflow, in real time, with me alongside. Session one establishes context. Sessions two through four are us building together — your voice profile, your people, your priorities. By session four it knows you well enough to draft in your voice.</p>
        <p><strong>Best for:</strong> technical or semi-technical founders who want hands-on learning while we install. Sessions 2–4 are booked after Session 1 so we can pace to your reality.</p>
        <p class="rung-cta"><a class="cta-primary" href="/book/coaching-block">Book Coaching Block</a></p>
      </article>

      <!-- Rungs (Task 4.4 onwards) -->

    </div>
  </section>
```

- [ ] **Step 2: Verify + commit**

```bash
git add offer/index.html
git commit -m "feat(offer): Coaching Block rung"
```

### Task 4.4: Build EA Basic Build rung

**Files:**
- Modify: `offer/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Rungs (Task 4.4 onwards) -->` with:

```html
      <article class="rung reveal-on-scroll" id="ea-basic-build">
        <p class="eyebrow">EA Basic Build</p>
        <h2>I install your assistant. <em>One week, $2,000.</em></h2>
        <span class="meta">5 working days · $2,000 AUD fixed</span>
        <p>For founders who want the assistant installed quickly and don't want to be in the build process. We meet once at the start — I walk away with everything I need (your tools, your voice samples, your top three people, your current priorities). End of the week we meet again and your assistant is live in your stack.</p>
        <p><strong>Best for:</strong> non-technical founders who want the end state, not the building process. Two meetings total, asynchronous in between.</p>
        <p class="rung-cta"><a class="cta-primary" href="/book/ea-basic-build">Book EA Basic Build</a></p>
      </article>

      <!-- Rungs (Task 4.5 onwards) -->
```

- [ ] **Step 2: Verify + commit**

```bash
git add offer/index.html
git commit -m "feat(offer): EA Basic Build rung"
```

### Task 4.5: Build Layers rung

**Files:**
- Modify: `offer/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Rungs (Task 4.5 onwards) -->` with:

```html
      <article class="rung reveal-on-scroll" id="layers">
        <p class="eyebrow">Layers</p>
        <h2>Capabilities, added async. <em>$500–$800 each.</em></h2>
        <span class="meta">Async · $500–800 AUD per layer</span>
        <p>After your assistant exists, capabilities stack. Want it to draft emails in your voice? Add a layer. Watch your calendar for conflicts and propose reschedules? Add a layer. Pull from your existing knowledge base and answer client questions? Add a layer. Each one is a small scoped engagement.</p>
        <p><strong>Best for:</strong> existing clients who've completed Coaching Block or EA Basic Build and want to extend the assistant's reach.</p>
        <p class="rung-cta"><a class="cta-secondary" href="mailto:cradsdavis@gmail.com?subject=Layer%20scope%20request">Email to scope a layer</a></p>
      </article>

      <!-- Rungs (Task 4.6 onwards) -->
```

- [ ] **Step 2: Verify + commit**

```bash
git add offer/index.html
git commit -m "feat(offer): Layers rung (email scope-request CTA, not a Book button)"
```

### Task 4.6: Build "Start with a call" closer

**Files:**
- Modify: `offer/index.html`

- [ ] **Step 1: Insert markup**

Replace `<!-- Rungs (Task 4.6 onwards) -->` with:

```html
      <article class="rung reveal-on-scroll" id="discovery">
        <p class="eyebrow">Not sure which fits?</p>
        <h2>Start with a call.</h2>
        <span class="meta">30 min · free</span>
        <p>Discovery is free. Thirty minutes. I'll ask what you're trying to build, you'll ask what I do, and by the end one of three things is true: a rung above fits, you've got a smaller problem we can solve in a single session, or this isn't the right shape and I'll point you somewhere better.</p>
        <p class="rung-cta"><a class="cta-primary" href="/book/discovery">Book a Discovery call</a></p>
      </article>
```

- [ ] **Step 2: Verify mobile + commit**

Test in mobile emulator. Verify all four rungs stack cleanly, CTAs work, anchor links from `/offer#coaching-block` etc. scroll correctly.

```bash
git add offer/index.html
git commit -m "feat(offer): Discovery rung (free 30-min closer)"
```

**Phase 4 complete.**

---

## Phase 5 · `/book` CSS-Swap (Preserve Stripe + Cal)

### Task 5.1: Update `/book/index.html` to import shared CSS

**Files:**
- Modify: `book/index.html`
- Modify: `book/_styles.css`

- [ ] **Step 1: Read current `/book/index.html` `<head>`**

Run: `head -25 c:/tmp/samdavis-site/book/index.html`

Note the existing `<link rel="stylesheet" href="/book/_styles.css">` import. The font import via `<link href="https://fonts.googleapis.com/css2?family=Inter...">` is duplicated against what `lib/site.css` already imports.

- [ ] **Step 2: Add shared CSS import + favicon to `<head>`**

In `c:/tmp/samdavis-site/book/index.html`, add immediately AFTER `<meta name="description">`:

```html
  <link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
  <link rel="stylesheet" href="/lib/site.css">
```

And REMOVE the existing line that already imports the Inter font separately:

```html
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Keep `<link rel="stylesheet" href="/book/_styles.css">` — that's the layout-specific CSS we still want.

- [ ] **Step 3: Audit `book/_styles.css` for duplicated tokens**

Run: `head -50 c:/tmp/samdavis-site/book/_styles.css`

Identify any `--bg-main`, `--ink-deep`, `--accent`, `--serif`, `--sans` definitions that duplicate `lib/site.css`. Remove them from `book/_styles.css` — they're now inherited from the shared file.

Example removal: if `_styles.css` has a `:root { --bg-main: #FAF7EE; --ink-deep: #3E3418; ... }` block, delete those duplicates. Keep `--anything` that's book-specific (page layout, grid measurements, card styles).

- [ ] **Step 4: Commit**

```bash
git add book/index.html book/_styles.css
git commit -m "refactor(book): adopt shared lib/site.css; remove duplicated palette/typography"
```

### Task 5.2: Run existing test suite

**Files:**
- (Tests only)

- [ ] **Step 1: Install deps if needed**

Run: `cd c:/tmp/samdavis-site && npm install`
Expected: succeeds without errors.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all 13 tests pass — `booking-status.test.js`, `checkout.test.js`, `webhook.test.js`.

- [ ] **Step 3: If any test fails**

The Phase 5 CSS swap shouldn't have touched any JS. If a test fails:
1. Read the test output to identify which test
2. Check git diff for changes that affected serverless code (should be none)
3. Roll back the CSS changes and retest

- [ ] **Step 4: Commit test-run evidence**

If passing, append to commit log via empty commit:

```bash
git commit --allow-empty -m "test(book): all 13 tests green post-CSS-swap"
```

### Task 5.3: End-to-end manual booking test

**Files:**
- (No file changes; live verification)

- [ ] **Step 1: Push branch to trigger Vercel preview**

Run: `git push`

Wait ~90s for deploy.

- [ ] **Step 2: Open preview `/book`**

Navigate to `<preview-url>/book/discovery` in browser.

Verify:
- Cal scheduling embed loads (iframe to Cal)
- New palette + typography apply
- Layout intact (no broken card grid)

- [ ] **Step 3: Walk Discovery booking flow**

Pick a Discovery slot. Confirm. Expected: Cal sends a confirmation email (check inbox). No payment step (Discovery is free).

- [ ] **Step 4: Walk a paid product flow (Stripe test mode)**

Navigate to `<preview-url>/book/coaching-block`. Pick a slot. Stripe Checkout opens. Use Stripe test card `4242 4242 4242 4242` with any future expiry and CVC. Submit.

Expected:
- Stripe Checkout succeeds
- Webhook fires (Cal booking created with payment metadata)
- User redirected to `/thanks` page
- Email confirmation arrives

If anything breaks, debug with `vercel logs --follow` and check that `/api/stripe/webhook.js` and `/api/cal/create-booking.js` haven't been touched.

- [ ] **Step 5: Commit "verified" note**

```bash
git commit --allow-empty -m "test(book): manual end-to-end booking verified on Vercel preview (Discovery + Stripe test mode)"
```

**Phase 5 complete.** Production-critical payment flow preserved.

---

## Phase 6 · `/onepager` + Demoted Pages

### Task 6.1: Update `/onepager` palette + illustration

**Files:**
- Modify: `onepager/index.html`

- [ ] **Step 1: Inspect current `onepager/index.html`**

Run: `head -50 c:/tmp/samdavis-site/onepager/index.html`

Note: this file has inline `<style>` with full palette definitions. Approach: import shared CSS, remove inline duplications, swap any illustration references to `/lib/img/sam-illustration.png`.

- [ ] **Step 2: Add shared CSS import**

In the `<head>` of `c:/tmp/samdavis-site/onepager/index.html`, after the existing `<meta name="viewport">`:

```html
  <link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
  <link rel="stylesheet" href="/lib/site.css">
```

- [ ] **Step 3: Remove duplicated palette + font import from inline `<style>`**

Locate the `:root { --bg: #FAF7EE; ... }` block AND the `@import url('https://fonts.googleapis.com/css2?family=Inter...')` line inside `<style>`. Delete both — they're inherited from shared CSS now.

Note: the existing onepager uses `--bg`, `--ink` etc. as variable names; the shared CSS uses `--bg-main`, `--ink-deep`. Rename references throughout the onepager's remaining inline CSS to match shared variables. Use find-and-replace:
- `--bg` → `--bg-main`
- `--ink` (where not `--ink-soft` or `--ink-faint`) → `--ink-deep`
- `--bg-card-hi` keep (already shared)
- `--accent-bright` keep
- `--accent-glow` keep
- `--rule` keep

- [ ] **Step 4: Swap illustration reference (if any)**

Search `onepager/index.html` for any `<img>` tag that references the old Canva illustration. Replace with:

```html
<img src="/lib/img/sam-illustration.png" alt="Sam Davis illustration">
```

If no `<img>` exists (the onepager may have been text-only), skip this step.

- [ ] **Step 5: Verify print preview**

Push + preview. In Chrome, `/onepager` → Ctrl+P (Cmd+P on Mac) → "More settings" → Layout: A4. Verify the page fits cleanly on one A4 page with the new palette + illustration.

- [ ] **Step 6: Commit**

```bash
git add onepager/index.html
git commit -m "refactor(onepager): adopt shared CSS + swap illustration to Edit 2 asset"
```

### Task 6.2: Apply shared CSS to `/build` + remove from nav

**Files:**
- Modify: `build/index.html`

- [ ] **Step 1: Inspect current `build/index.html`**

Run: `head -40 c:/tmp/samdavis-site/build/index.html`

- [ ] **Step 2: Add shared CSS import**

Add to `<head>` after `<meta name="viewport">`:

```html
  <link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
  <link rel="stylesheet" href="/lib/site.css">
```

- [ ] **Step 3: Remove duplicated palette tokens**

Inside the existing inline `<style>` block, remove any `:root { --bg: ... }` definitions that duplicate shared CSS. Variable-rename to match shared tokens (`--bg` → `--bg-main`, etc.) per Task 6.1 Step 3 procedure.

- [ ] **Step 4: Update nav to remove `/build` link from primary nav**

In the `<nav>` block, remove the `<a href="/build">For businesses</a>` link AND its preceding/following `<span class="sep">·</span>`. The nav should become Home · Overview · Offer · Book.

If the `<nav>` element is the older 5-link version, replace with the new four-link version from Phase 2's pattern (but for /build, set no `.current` class because we're keeping the page but not advertising it in nav of OTHER pages — the /build page itself is fine to have its own current state OR just omit primary nav entirely on the demoted page).

- [ ] **Step 5: Add footer back-link**

Verify the `<footer>` includes a `<a href="/">← Home</a>` line so visitors can navigate back. If not present, add it.

- [ ] **Step 6: Commit**

```bash
git add build/index.html
git commit -m "refactor(build): adopt shared CSS + remove from primary nav (URL-stable)"
```

### Task 6.3: Apply shared CSS to `/build-onepager`

**Files:**
- Modify: `build-onepager/index.html`

- [ ] **Step 1-4: Repeat Task 6.2 steps for build-onepager**

Same procedure: add shared CSS import, remove duplicated palette tokens, rename CSS variables, demote from primary nav.

- [ ] **Step 5: Verify print preview** (A4)

- [ ] **Step 6: Commit**

```bash
git add build-onepager/index.html
git commit -m "refactor(build-onepager): adopt shared CSS + demote from primary nav"
```

### Task 6.4: Verify URL resolution for demoted pages

**Files:**
- (No file changes; verification only)

- [ ] **Step 1: Push + open preview**

Run: `git push`

Wait for deploy. Open Vercel preview.

- [ ] **Step 2: Confirm old URLs still resolve**

Visit `<preview-url>/build` and `<preview-url>/build-onepager` directly.
Expected: pages render with new shared CSS. No 404s.

- [ ] **Step 3: Confirm nav links from primary pages don't reference /build**

Visit `<preview-url>/`, `<preview-url>/overview`, `<preview-url>/offer`. Open browser DevTools → click "Elements" → search `nav`. Verify no `<a href="/build">` in any primary page's nav.

- [ ] **Step 4: Commit verification log**

```bash
git commit --allow-empty -m "test(demoted): verified /build + /build-onepager URLs resolve; no nav links from primary pages"
```

**Phase 6 complete.**

---

## Phase 7 · Staging + QA + Merge

### Task 7.1: Lighthouse audit

**Files:**
- (No file changes; audit only)

- [ ] **Step 1: Run Lighthouse on each page**

Open Chrome DevTools → Lighthouse tab. Run on Vercel preview URLs:
- `<preview-url>/`
- `<preview-url>/overview`
- `<preview-url>/offer`
- `<preview-url>/book`
- `<preview-url>/onepager`

For each, run BOTH "Mobile" and "Desktop" simulations. Target: ≥95 on all 4 metrics (Performance, Accessibility, Best Practices, SEO).

- [ ] **Step 2: Fix any sub-95 metric**

Most likely causes of score loss + fixes:
- **Performance:** illustration PNG too big → re-encode as JPEG with cream background baked in OR add `loading="lazy"` on below-fold images
- **Accessibility:** missing alt text → add. Low contrast → bump ink-soft / ink-faint values. Form labels → add explicit labels
- **Best Practices:** mixed content / console errors → fix
- **SEO:** missing meta description → add. Missing `<title>` → add

If a fix is needed, commit with `perf(<page>): fix Lighthouse <metric>` or `fix(a11y): <description>`.

- [ ] **Step 3: Record final scores**

Create `c:/tmp/samdavis-site/docs/superpowers/qa/2026-05-18-lighthouse-results.md`:

```markdown
# Lighthouse audit · 2026-05-18 · feat/boutique-redesign-2026-05

| Page | Mobile P | Mobile A | Mobile BP | Mobile SEO | Desktop P | Desktop A | Desktop BP | Desktop SEO |
|---|---|---|---|---|---|---|---|---|
| / | XX | XX | XX | XX | XX | XX | XX | XX |
| /overview | XX | XX | XX | XX | XX | XX | XX | XX |
| /offer | XX | XX | XX | XX | XX | XX | XX | XX |
| /book | XX | XX | XX | XX | XX | XX | XX | XX |
| /onepager | XX | XX | XX | XX | XX | XX | XX | XX |
```

Replace `XX` with actual scores.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/qa/2026-05-18-lighthouse-results.md
git commit -m "test(qa): Lighthouse audit results recorded"
```

### Task 7.2: WCAG AA contrast audit

**Files:**
- (No file changes; audit only — fixes if needed)

- [ ] **Step 1: Run contrast audit**

Use Chrome DevTools Lighthouse (already run) — it flags contrast issues automatically. OR use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) for each text-on-background pair from the design tokens:

- `--ink-deep` (#3E3418) on `--bg-main` (#FAF7EE) — body text
- `--ink-soft` (#6B5F3A) on `--bg-main` — subheads
- `--ink-faint` (#998D6B) on `--bg-main` — metadata (CHECK)
- `--accent` (#8F7530) on `--bg-main` — eyebrows + links
- `--bg-main` (#FAF7EE) on `--accent` (#8F7530) — CTA button text
- `--ink-soft` (#6B5F3A) on `--bg-card` (#DCE0B6) — card text

Required: AA = 4.5:1 for body, 3:1 for large text (≥18px bold or ≥24px).

- [ ] **Step 2: Fix any failing pair**

If `--ink-faint` (#998D6B) fails on `--bg-main` (likely — that's a metadata color), darken it to ~#7C7050 in `lib/site.css`.

- [ ] **Step 3: Commit any fixes**

```bash
git add lib/site.css
git commit -m "fix(a11y): bump --ink-faint to meet WCAG AA contrast"
```

### Task 7.3: Keyboard navigation audit

**Files:**
- (No file changes typically; fixes if needed)

- [ ] **Step 1: Test each page**

For `/`, `/overview`, `/offer`, `/book`, `/onepager`:
- Press Tab repeatedly from top of page
- Verify every interactive element (nav link, CTA, in-page anchor, footer link) receives focus
- Verify visible focus indicator on each (outline or background change)
- Verify Tab order matches visual reading order
- Verify Enter/Space activates focused element

- [ ] **Step 2: Add focus styles if missing**

If focus indicators are weak/invisible, add to `lib/site.css`:

```css
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
.cta-primary:focus-visible {
  outline-color: var(--ink-deep);
  outline-offset: 4px;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/site.css
git commit -m "fix(a11y): visible focus indicators with brass outline"
```

### Task 7.4: `prefers-reduced-motion` verification

**Files:**
- (No file changes typically)

- [ ] **Step 1: Enable reduced-motion in OS**

- macOS: System Settings → Accessibility → Display → "Reduce motion" ON
- Windows: Settings → Accessibility → Visual effects → "Animation effects" OFF
- iOS: Settings → Accessibility → Motion → "Reduce Motion" ON
- Android: Settings → Accessibility → "Remove animations" ON

- [ ] **Step 2: Reload Vercel preview pages**

Open `<preview-url>/`. Verify:
- Illustration does NOT float
- H1 italic word does NOT morph (stays on initial phrase)
- Scroll-reveal sections appear immediately (no fade-in)
- Hover state changes (color/shadow) STILL fire (these are not "motion" per WCAG)

- [ ] **Step 3: Disable reduced-motion + commit verification**

Toggle back off.

```bash
git commit --allow-empty -m "test(a11y): prefers-reduced-motion verified — animations disabled, hover states retained"
```

### Task 7.5: Real-device test (iOS + Android)

**Files:**
- (No file changes typically)

- [ ] **Step 1: iOS Safari test**

On real iPhone, open Vercel preview. Walk full funnel:
- Tap each nav link
- Scroll through `/`, `/overview`, `/offer`
- Tap "Book a 30-minute call"
- Pick Discovery slot
- Confirm booking flow works end-to-end

Verify:
- No layout shift on load
- Float animation smooth (no jank)
- Scroll reveals fire correctly
- Tap targets all hit easily
- No console errors (visit Safari → Develop → iPhone → see console)

- [ ] **Step 2: Android Chrome test**

Same test on real Android device.

- [ ] **Step 3: Commit verification log**

```bash
git commit --allow-empty -m "test(real-device): iOS Safari + Android Chrome verified end-to-end"
```

### Task 7.6: `/gsd:code-review` on feature branch

**Files:**
- (Generates `REVIEW.md`)

- [ ] **Step 1: Invoke `/gsd:code-review`**

In Claude Code, run:

```
/gsd:code-review
```

The agent reviews the branch's changes against `main`. It produces `REVIEW.md` with severity-classified findings.

- [ ] **Step 2: Address Critical + High findings**

Critical = security issues, broken functionality, payment integration risks.
High = significant quality concerns affecting maintainability or UX.

Medium and Low can be deferred to follow-up issues.

For each Critical/High, fix the issue and commit with `fix(review): <description>`.

- [ ] **Step 3: Commit REVIEW.md** (it's in .gitignore by convention, but add to plan record)

```bash
# REVIEW.md is gitignored; don't commit it. Just note the findings were addressed.
git commit --allow-empty -m "test(review): /gsd:code-review run, Critical + High findings addressed"
```

### Task 7.7: Open PR + final user review

**Files:**
- (No file changes; PR opened)

- [ ] **Step 1: Push final commits**

```bash
git push
```

- [ ] **Step 2: Open PR**

Using `gh` CLI:

```bash
gh pr create --title "Boutique redesign · crads-ai.com" --body "$(cat <<'EOF'
## Summary

- Full redesign of crads-ai.com across 5 founder-side pages into strategy-boutique register
- Comparable in register to anthropic.com, sequoiacap.com, stripe.press
- Shared design tokens extracted into `lib/site.css` + `lib/site.js`
- `/overview` + `/offer` converted from slide-deck to essay shape
- `/book` CSS-swap only; all 13 existing tests green; Stripe + Cal integration preserved
- `/build` + `/build-onepager` demoted from primary nav (URL-stable)
- Nano Banana Edit 2 illustration adopted as brand mark + favicon

## Verification

- ✅ All 13 existing tests green (`npm test`)
- ✅ Manual end-to-end booking through Stripe test mode succeeded
- ✅ Lighthouse ≥95 on all 4 metrics, mobile + desktop, all pages (see `docs/superpowers/qa/`)
- ✅ WCAG AA contrast on every text-on-bg pair
- ✅ Keyboard navigation with visible focus states
- ✅ `prefers-reduced-motion` disables animations, retains hover states
- ✅ Real-device iOS Safari + Android Chrome end-to-end
- ✅ `/build` + `/build-onepager` URLs still resolve

## Test plan

- [ ] User walks Discovery booking on phone
- [ ] User walks paid Coaching Block booking on phone (Stripe test mode)
- [ ] User confirms visual register matches Anthropic/Sequoia expectations
- [ ] User approves merge → squash-merge to main → Vercel auto-deploys to crads-ai.com

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: User walks the preview**

User opens the PR's Vercel preview link and:
1. Walks `/` → `/overview` → `/offer` on desktop
2. Walks the same on phone
3. Books a Discovery slot end-to-end on phone (real booking, can cancel after)
4. Verifies register feels "boutique consulting" not "AI agency template"

- [ ] **Step 4: User comments on PR or in chat with verdict**

If "ship it" → proceed to Task 7.8.
If changes requested → make changes, repeat Tasks 7.1-7.3 for any sections touched, then re-request review.

### Task 7.8: Merge + production swap

**Files:**
- (No file changes; merge only)

- [ ] **Step 1: Verify timing**

Production swap should happen OUTSIDE the Wed/Thu discovery-call window. Tuesday evening AEST or Friday morning AEST. Confirm timing with user.

- [ ] **Step 2: Squash-merge PR**

```bash
gh pr merge --squash
```

Or via GitHub UI: PR → "Squash and merge".

- [ ] **Step 3: Watch Vercel production deploy**

Run: `vercel logs --follow` OR open Vercel dashboard. Wait for production deploy to complete (~90s).

- [ ] **Step 4: Smoke test crads-ai.com**

Open `https://crads-ai.com/` in incognito browser. Walk:
- `/` renders with new design
- Nav links work
- Italic morph fires
- `/book` opens Cal scheduling
- One test booking through Stripe live mode (with a real $0.01 test product if available, or skip and just verify the Stripe Checkout page loads)

- [ ] **Step 5: Tag release**

```bash
git checkout main
git pull
git tag -a redesign-v1 -m "Boutique redesign v1 — crads-ai.com"
git push --tags
```

- [ ] **Step 6: Delete feature branch**

```bash
git branch -d feat/boutique-redesign-2026-05
git push origin --delete feat/boutique-redesign-2026-05
```

**Phase 7 complete. Redesign shipped.**

---

## Self-Review Checklist

Before handing this plan to execution, verifying:

**1. Spec coverage:**
- ✓ Architecture (5 primary + 2 demoted) — covered Tasks 0.1, 2.x-6.x
- ✓ Design system (palette, typography, spacing, motion) — covered Phase 1
- ✓ Logo direction (Edit 2 + Playfair Display) — Tasks 1.1-1.2, 2.3, 3.2, 4.2
- ✓ Funnel (founder primary) — Tasks 2.x, 4.x
- ✓ Voice (signature) — copy embedded in tasks 2.3-2.7, 3.3-3.8, 4.3-4.6
- ✓ Motion (Linear-on-serif) — Phase 1 + scroll reveal data-attributes throughout
- ✓ Content (own credentials + builds, no client names) — embedded copy avoids Greener Edge/SEAF/Impact Collab
- ✓ Mobile responsive — Task 1.4 (breakpoints) + Task 2.8 (mobile pass)
- ✓ Stripe/Cal preservation — Phase 5 dedicated, Tasks 5.2 (test suite) + 5.3 (manual e2e)
- ✓ QA gates — Phase 7

**2. Placeholder scan:**
- ✓ No TBDs/TODOs in step content
- ✓ One `<!-- TODO when Abbey permission lands -->` comment in Task 3.5 — explicit and tracked
- ✓ Lighthouse scores section has `XX` placeholders that get filled at audit time — these are templates, not unspecified work
- ✓ All file paths absolute
- ✓ All shell commands concrete

**3. Type consistency:**
- ✓ CSS variable names consistent (`--bg-main`, `--ink-deep`, `--accent`, etc.) across Tasks 1.3, 1.4, and all page tasks
- ✓ Class names consistent (`.cta-primary`, `.cta-secondary`, `.eyebrow`, `.lede`, `.italic-morph`, `.reveal-on-scroll`, `.float-gentle`)
- ✓ Component data attributes consistent (`data-phrases`, `--reveal-index`)
- ✓ Anchor IDs consistent (`#coaching-block`, `#ea-basic-build` etc. used in both /offer and the per-rung CTAs)

No issues found. Plan is implementation-ready.

---

## Execution Handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-05-18-crads-ai-boutique-redesign-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per phase or task. Each subagent works in clean context, I review between phases, fast iteration. Best for a 17-18h project where I want to keep the main context window clean for review judgement.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batch execution with checkpoints for review. Best if you want continuous oversight in a single session.

**Which approach?**
