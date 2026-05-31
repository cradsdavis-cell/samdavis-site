# crads-ai.com /about page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a long-form CV-shape `/about/` page for crads-ai.com — accordion-collapsed by default with a sticky identity rail — and wire it into the canonical site nav as a 5th item between Overview and Offer.

**Architecture:** New static page at `about/index.html` following existing site conventions. Two-column grid (identity rail · main column) with sticky sidebar. Main column uses a click-to-expand accordion pattern: closed shows 1-line teasers, expanded shows 2–4 sentence paragraphs. Shared design tokens via `lib/site.css`; toggle logic appended to `lib/site.js`. Tests follow the existing `node:test` pattern — string-match smoke tests over the rendered HTML.

**Tech Stack:** Vanilla HTML/CSS/JS · Vercel static hosting · `node:test` for smoke tests · existing `lib/site.css` design tokens (`--bg-soft`, `--ink-deep`, `--ink-soft`, `--accent`, `--accent-deep`, `--space-*`, `--serif`, `--sans`)

**Source spec:** [docs/superpowers/specs/2026-05-31-crads-ai-about-page-design.md](../specs/2026-05-31-crads-ai-about-page-design.md)

**Content authority:** All factual claims in expanded prose MUST be verifiable against `CVs/master-profile.yaml` (in the EA repo at `c:/Users/user/OneDrive/Documents/Sam/EA/CVs/master-profile.yaml`). If a claim has no source, drop it or rephrase to what the source supports. Per `feedback_stay_within_ability_level`.

**Voice rules:** Every paragraph of expanded prose runs through the 7-check from `.claude/rules/voice-anti-patterns.md` (EA repo) before commit. Search-and-replace pass for the 23-word AI-vocabulary list; em-dash density ≤ 2 per paragraph; concrete > abstract.

---

## File map

**Create:**
- `about/index.html` — the page
- `tests/about.test.js` — smoke tests over the rendered HTML

**Modify (append-only, well-marked sections):**
- `lib/site.css` — append `/* ============ /about page ============ */` block at end
- `lib/site.js` — append `initAboutAccordion()` to the IIFE's init list

**Modify (insert one nav `<a>` between Overview and Offer):**
- `index.html`
- `overview/index.html`
- `offer/index.html`
- `thanks.html`
- `booking-failed.html`
- `book/index.html`
- `book/coaching-block.html`
- `book/discovery.html`
- `book/ea-basic-build.html`
- `book/single-session.html`

**Leave alone (different nav pattern):** `onepager/index.html`, `build/index.html`, `build-onepager/index.html`.

---

## Task 1: Skeleton page + smoke test (TDD opener)

**Files:**
- Create: `tests/about.test.js`
- Create: `about/index.html`

- [ ] **Step 1.1: Write the failing smoke test**

Create `tests/about.test.js`:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'about', 'index.html'),
  'utf8'
);

test('about page has the canonical head', () => {
  assert.ok(html.includes('<title>About — Sam Davis</title>'),
    'expected canonical title');
  assert.ok(html.includes('href="/lib/site.css"'),
    'expected shared CSS link');
  assert.ok(html.includes('src="/lib/site.js"'),
    'expected shared JS link');
});

test('about page renders the canonical nav with About marked current', () => {
  assert.ok(html.includes('<nav class="site-nav-bar">'),
    'expected canonical site-nav-bar');
  assert.match(html, /<a href="\/about" class="current">About<\/a>/,
    'expected About link marked current');
  assert.ok(html.includes('<a href="/">Home</a>'));
  assert.ok(html.includes('<a href="/overview">Overview</a>'));
  assert.ok(html.includes('<a href="/offer">Offer</a>'));
  assert.ok(html.includes('<a href="/book">Book →</a>'));
});

test('about page has identity rail with name', () => {
  assert.match(html, /Samuel<br>Caradog Davis/,
    'expected name with line break');
});

test('about page has the three main section headings', () => {
  assert.ok(html.includes('>Experience<'), 'expected Experience heading');
  assert.ok(html.includes('>Side practice<'), 'expected Side practice heading');
  assert.ok(html.includes('>Builds'), 'expected Builds heading');
});

test('about page renders the canonical site-footer', () => {
  assert.ok(html.includes('<footer class="site-footer wrap">'),
    'expected canonical site-footer');
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `ENOENT: no such file or directory, open '.../about/index.html'`.

- [ ] **Step 1.3: Create about/index.html skeleton**

Create `about/index.html` (skeleton — content lands in later tasks):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>About — Sam Davis</title>
<meta name="description" content="Samuel Caradog Davis — PhD environmental data scientist, AI builder, facilitator. Career, education, recognition, and 8 AI builds in 12 months.">
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
    <a href="/">Home</a>
    <a href="/overview">Overview</a>
    <a href="/about" class="current">About</a>
    <a href="/offer">Offer</a>
    <a href="/book">Book →</a>
  </div>
</nav>

<main class="about-page wrap">
  <div class="about-grid">

    <aside class="about-sidebar">
      <h1>Samuel<br>Caradog Davis</h1>
      <!-- Identity rail content lands in Task 6 -->
    </aside>

    <div class="about-main">
      <h2>Experience</h2>
      <!-- Experience rows land in Task 7 -->

      <h2>Side practice</h2>
      <!-- Wildly Calm row lands in Task 8 -->

      <h2>Builds <span class="builds-count">(8 in 12 months)</span></h2>
      <!-- Build rows land in Task 9 -->
    </div>

  </div>
</main>

<footer class="site-footer wrap">
  <span class="wordmark">Sam Davis<span class="accent">.</span></span>
  <div><a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a></div>
  <div><a href="https://linkedin.com/in/samuel-davis4" target="_blank" rel="noopener">linkedin.com/in/samuel-davis4</a></div>
  <div><a href="/book">Book a 30-minute call →</a></div>
  <div class="location">Coogee, Sydney.</div>
</footer>

</body>
</html>
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npm test`

Expected: PASS — all 5 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add about/index.html tests/about.test.js
git commit -m "feat(about): scaffold /about page + smoke tests"
```

---

## Task 2: Wire the new nav link into all 10 nav-bearing pages

**Files (modify each — insert one `<a>` between Overview and Offer):**
- `index.html`
- `overview/index.html`
- `offer/index.html`
- `thanks.html`
- `booking-failed.html`
- `book/index.html`
- `book/coaching-block.html`
- `book/discovery.html`
- `book/ea-basic-build.html`
- `book/single-session.html`

- [ ] **Step 2.1: Write the failing test (extend `tests/about.test.js`)**

Append to `tests/about.test.js`:

```javascript
const NAV_PAGES = [
  'index.html',
  'overview/index.html',
  'offer/index.html',
  'thanks.html',
  'booking-failed.html',
  'book/index.html',
  'book/coaching-block.html',
  'book/discovery.html',
  'book/ea-basic-build.html',
  'book/single-session.html',
];

test('every nav-bearing page links to /about between Overview and Offer', () => {
  for (const rel of NAV_PAGES) {
    const fp = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(fp, 'utf8');
    // The About link must appear AFTER the Overview link and BEFORE the Offer link.
    const idxOverview = src.indexOf('<a href="/overview"');
    const idxAbout = src.indexOf('<a href="/about"');
    const idxOffer = src.indexOf('<a href="/offer"');
    assert.ok(idxOverview > -1, `${rel}: missing Overview link`);
    assert.ok(idxAbout > -1, `${rel}: missing About link`);
    assert.ok(idxOffer > -1, `${rel}: missing Offer link`);
    assert.ok(idxOverview < idxAbout && idxAbout < idxOffer,
      `${rel}: About must sit between Overview and Offer`);
  }
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL — the new test reports missing About link in `index.html` (first page checked).

- [ ] **Step 2.3: Insert the About nav link in each page**

For EACH of the 10 files listed above, locate the nav-links block:

```html
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="/overview">Overview</a>
    <a href="/offer">Offer</a>
    <a href="/book">Book →</a>
  </div>
```

Insert `<a href="/about">About</a>` between Overview and Offer. The pattern becomes:

```html
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="/overview">Overview</a>
    <a href="/about">About</a>
    <a href="/offer">Offer</a>
    <a href="/book">Book →</a>
  </div>
```

Preserve the existing `class="current"` marker on whichever link the page already marks as current (e.g. `overview/index.html` has `class="current"` on its Overview link — leave it).

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm test`

Expected: PASS — all tests green including the nav-coverage check.

- [ ] **Step 2.5: Commit**

```bash
git add index.html overview/index.html offer/index.html thanks.html booking-failed.html book/index.html book/coaching-block.html book/discovery.html book/ea-basic-build.html book/single-session.html tests/about.test.js
git commit -m "feat(nav): add /about link between Overview and Offer on all canonical pages"
```

---

## Task 3: Layout CSS — grid + sticky identity rail + responsive stack

**Files:**
- Modify: `lib/site.css` (append at end)

- [ ] **Step 3.1: Append the layout CSS block**

Append to `lib/site.css`:

```css
/* ============================================================
   /about — long-form CV page (2026-05-31)
   Two-column grid, sticky identity rail, accordion main column.
   ============================================================ */

.about-page {
  padding-top: var(--space-5);
  padding-bottom: var(--space-5);
}

.about-grid {
  display: grid;
  grid-template-columns: minmax(220px, 0.55fr) minmax(0, 1.45fr);
  gap: var(--space-5);
  align-items: flex-start;
}

.about-sidebar {
  position: sticky;
  top: var(--space-3);
  align-self: flex-start;
  max-height: calc(100vh - var(--space-4));
  overflow-y: auto;
  padding-right: var(--space-2);
  /* hide the scrollbar visually but keep it functional */
  scrollbar-width: thin;
}

.about-sidebar h1 {
  font-size: clamp(28px, 3vw, 36px);
  line-height: 1.05;
  margin: 0 0 var(--space-1);
}

.about-sidebar .role {
  color: var(--accent);
  font-family: var(--sans);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: var(--space-2);
}

.about-sidebar .summary {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-soft);
  margin-bottom: var(--space-3);
  border-left: 2px solid var(--accent);
  padding-left: var(--space-2);
}

.about-sidebar h4 {
  font-family: var(--serif);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-deep);
  margin: var(--space-3) 0 var(--space-1);
  border-bottom: 1px solid rgba(143, 117, 48, 0.25);
  padding-bottom: 4px;
}
.about-sidebar h4:first-of-type { margin-top: 0; }

.about-sidebar .sb-item {
  font-family: var(--sans);
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: var(--space-1);
}
.about-sidebar .sb-item .when {
  color: var(--accent);
  font-size: 11px;
  display: block;
}
.about-sidebar .sb-item .where { font-weight: 600; color: var(--ink-deep); }
.about-sidebar .sb-item .detail { color: var(--ink-soft); }

.about-sidebar .skills-pills span {
  display: inline-block;
  background: var(--bg-soft);
  border: 1px solid rgba(143, 117, 48, 0.18);
  color: var(--ink-soft);
  font-family: var(--sans);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  margin: 2px 4px 2px 0;
}

.about-main h2 {
  font-size: clamp(22px, 2.4vw, 30px);
  margin: 0 0 var(--space-2);
}
.about-main h2:not(:first-of-type) {
  margin-top: var(--space-5);
}

.about-main .builds-count {
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 400;
  color: var(--accent);
  text-transform: none;
  letter-spacing: 0;
}

@media (max-width: 900px) {
  .about-grid {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }
  .about-sidebar {
    position: static;
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }
  .about-main h2:not(:first-of-type) {
    margin-top: var(--space-4);
  }
}
```

- [ ] **Step 3.2: Visual sanity check**

Open `about/index.html` locally (e.g. `npx serve .` or `python -m http.server`). Verify:
- Sidebar appears on the left (~30% width at ≥901px), main column on the right.
- Scroll the page — sidebar stays fixed.
- Resize to <900px — layout stacks (sidebar above main, no longer sticky).

Expected: layout works. Existing pages (`/`, `/overview`, etc.) unchanged.

- [ ] **Step 3.3: Run smoke tests**

Run: `npm test`

Expected: PASS — no regression in existing tests.

- [ ] **Step 3.4: Commit**

```bash
git add lib/site.css
git commit -m "feat(about): layout CSS — two-col grid + sticky identity rail + responsive stack"
```

---

## Task 4: Accordion CSS — rows, header, body, caret rotation

**Files:**
- Modify: `lib/site.css` (continue the `/about` block)

- [ ] **Step 4.1: Append the accordion CSS**

Append to `lib/site.css` (right after the Task 3 block):

```css
/* /about — accordion rows */

.about-row {
  border-bottom: 1px solid rgba(143, 117, 48, 0.18);
  padding: var(--space-2) 0;
}

.about-row-header {
  display: grid;
  grid-template-columns: 110px 1fr 24px;
  gap: var(--space-2);
  align-items: baseline;
  cursor: pointer;
  background: transparent;
  border: 0;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  padding: 0;
}
.about-row-header:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 2px;
}

.about-row-header .when {
  font-family: var(--sans);
  color: var(--accent);
  font-size: 13px;
  line-height: 1.5;
}

.about-row-header .where {
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-deep);
  line-height: 1.4;
}
.about-row-header .where .org {
  color: var(--ink-soft);
  font-weight: 400;
}

.about-row-header .teaser {
  font-family: var(--sans);
  font-size: 14px;
  color: var(--ink-soft);
  margin-top: 2px;
  line-height: 1.5;
}

.about-row-header .caret {
  color: var(--accent);
  font-size: 14px;
  transition: transform 0.18s ease;
  align-self: center;
  justify-self: end;
}
.about-row[aria-expanded="true"] .about-row-header .caret {
  transform: rotate(90deg);
}

.about-row-body {
  display: none;
  padding: var(--space-2) 0 0 122px;
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.65;
  color: var(--ink-deep);
}
.about-row[aria-expanded="true"] .about-row-body {
  display: block;
}
.about-row-body p { margin: 0 0 var(--space-1); font-size: 15px; }
.about-row-body p:last-child { margin-bottom: 0; }

.about-row-body .stack {
  display: inline-block;
  background: var(--bg-soft);
  border: 1px solid rgba(143, 117, 48, 0.18);
  color: var(--ink-soft);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  margin: var(--space-1) 4px 0 0;
}

.about-row .side-practice-label {
  display: inline-block;
  background: var(--bg-soft);
  color: var(--accent);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: var(--space-1);
  vertical-align: middle;
}

@media (max-width: 900px) {
  .about-row-header {
    grid-template-columns: 80px 1fr 20px;
    gap: var(--space-1);
  }
  .about-row-body {
    padding-left: 88px;
  }
}
```

- [ ] **Step 4.2: Visual sanity check**

Reload `about/index.html`. No accordion rows render yet (content lands in Task 7+), so only the section headings show. Sidebar styles + h2 styles should look correct.

Expected: page does not regress. No content yet in the main column.

- [ ] **Step 4.3: Commit**

```bash
git add lib/site.css
git commit -m "feat(about): accordion CSS — row header, body, caret rotation, a11y focus ring"
```

---

## Task 5: Accordion JS — toggle function + keyboard a11y

**Files:**
- Modify: `lib/site.js` (append to the IIFE)

- [ ] **Step 5.1: Append the accordion init function**

Open `lib/site.js`. Locate the IIFE's init block at the end (the section that calls `initItalicMorph(); initScrollReveal(); initSmoothScroll(); initTypewriter();`).

Add a new `initAboutAccordion()` function inside the IIFE, BEFORE the init block. Then add a call to it in the init block.

Append the function definition (place it adjacent to the existing init functions):

```javascript
  // ---------- About accordion ----------
  function initAboutAccordion() {
    const headers = document.querySelectorAll('.about-row-header');
    if (!headers.length) return;

    function toggle(header) {
      const row = header.closest('.about-row');
      if (!row) return;
      const expanded = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }

    headers.forEach((header) => {
      header.addEventListener('click', () => toggle(header));
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle(header);
        }
      });
    });
  }
```

Update the init block to call `initAboutAccordion()`:

```javascript
  // ---------- Init ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initItalicMorph();
      initScrollReveal();
      initSmoothScroll();
      initTypewriter();
      initAboutAccordion();
    });
  } else {
    initItalicMorph();
    initScrollReveal();
    initSmoothScroll();
    initTypewriter();
    initAboutAccordion();
  }
```

- [ ] **Step 5.2: Sanity check — no JS errors on other pages**

Open `index.html`, `overview/index.html`, `offer/index.html` locally. Open browser devtools console.

Expected: no JS errors. `initAboutAccordion()` is a no-op when no `.about-row-header` elements exist.

- [ ] **Step 5.3: Commit**

```bash
git add lib/site.js
git commit -m "feat(about): accordion JS — click + keyboard toggle with aria-expanded"
```

---

## Task 6: Content — Identity rail (Skills · Education · Recognition)

**Files:**
- Modify: `about/index.html` (replace the `<aside class="about-sidebar">` block)

**Content authority:** `CVs/master-profile.yaml` in the EA repo. Implementer must read it before writing prose. The blocks below are the source-of-truth shape; specific text below verified against `notes/context/me.md` and may need light refinement against master-profile.

- [ ] **Step 6.1: Extend the smoke test**

Append to `tests/about.test.js`:

```javascript
test('identity rail renders Skills, Education, Recognition blocks', () => {
  assert.ok(html.includes('class="about-sidebar"'), 'expected sidebar');
  assert.ok(html.includes('Data scientist · AI builder'), 'expected role line');
  assert.match(html, />Skills</, 'expected Skills heading');
  assert.match(html, />Education</, 'expected Education heading');
  assert.match(html, />Recognition</, 'expected Recognition heading');
  // Recognition rule — Pik Perseverance framed as team member
  assert.match(html, /first-ascent team/i,
    'Kyrgyzstan must be framed as team member, never expedition leader');
});
```

Re-read the file at test time (the existing test file reads HTML once at top). Refactor the top of `tests/about.test.js` so each test re-reads (or keep the closure-style but assume the file is read fresh in a `before` hook):

```javascript
function readAbout() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'about', 'index.html'),
    'utf8'
  );
}
// then in each test: const html = readAbout();
```

Adjust the earlier tests to use `readAbout()` too so they all see fresh state across runs.

- [ ] **Step 6.2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL — identity rail block isn't populated yet.

- [ ] **Step 6.3: Replace the sidebar block**

In `about/index.html`, replace:

```html
    <aside class="about-sidebar">
      <h1>Samuel<br>Caradog Davis</h1>
      <!-- Identity rail content lands in Task 6 -->
    </aside>
```

with:

```html
    <aside class="about-sidebar">
      <h1>Samuel<br>Caradog Davis</h1>
      <div class="role">Data scientist · AI builder</div>
      <div class="summary">PhD environmental data scientist. 8 AI builds in 12 months. Translator and pathfinder by fingerprint — bridges deep technical systems and real-world impact.</div>

      <h4>Skills</h4>
      <div class="skills-pills">
        <span>Python</span><span>R</span><span>SQL</span><span>Bayesian</span><span>MCMC</span><span>Claude Code</span><span>MCPs</span><span>Data engineering</span><span>Facilitation</span><span>Teaching</span>
      </div>

      <h4>Education</h4>
      <div class="sb-item">
        <span class="when">2022 – 26</span>
        <span class="where">PhD · University of Sydney</span>
        <span class="detail">Environmental &amp; ecological data science · DARE ARC Training Centre</span>
      </div>
      <div class="sb-item">
        <span class="when">2016 – 20</span>
        <span class="where">MPhys · University of Manchester</span>
        <span class="detail">First Class · 4th in cohort end of 3rd year</span>
      </div>
      <div class="sb-item">
        <span class="when">2008 – 13</span>
        <span class="where">Ysgol y Moelwyn</span>
        <span class="detail">Welsh-medium state comprehensive · Blaenau Ffestiniog</span>
      </div>

      <h4>Recognition</h4>
      <div class="sb-item">
        <span class="where">Pik Perseverance, 4,788m</span>
        <span class="detail">Member of British Alpine Club first-ascent team, Kyrgyzstan 2021</span>
      </div>
      <div class="sb-item">
        <span class="where">XXI Club, Manchester</span>
        <span class="detail">Elected for outstanding volunteering</span>
      </div>
      <div class="sb-item">
        <span class="where">Mountaineering Society Captain</span>
        <span class="detail">Manchester · grew membership 70%</span>
      </div>
    </aside>
```

**Verify before commit:** open `CVs/master-profile.yaml` and confirm each claim. If any line conflicts with the canonical profile, the canonical profile wins.

- [ ] **Step 6.4: Run test to verify it passes**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
git add about/index.html tests/about.test.js
git commit -m "feat(about): populate identity rail — Skills, Education, Recognition"
```

---

## Task 7: Content — Experience (9 accordion rows)

**Files:**
- Modify: `about/index.html` (replace the Experience comment with 9 rows)

**Voice gate:** every paragraph below runs through the 7-check from `.claude/rules/voice-anti-patterns.md` before commit. Drop any AI-vocabulary word from the 23-word list. Em-dash density ≤ 2 per paragraph.

- [ ] **Step 7.1: Extend the smoke test**

Append to `tests/about.test.js`:

```javascript
test('experience renders 9 accordion rows in reverse-chronological order', () => {
  const h = readAbout();
  const rows = h.match(/<div class="about-row"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g) || [];
  // Counting is fragile — use a simpler marker per role:
  const roleMarkers = [
    'Independent AI coach',
    'SEAF / UWA',
    'AMME, USYD',
    'DARE ARC',
    'Alan Turing Institute',
    'Satellite Catapult',
    'Apadmi Ltd',
    'European Space Agency',
    'Harrow International School',
  ];
  for (const marker of roleMarkers) {
    assert.ok(h.includes(marker), `expected role marker: ${marker}`);
  }
});
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL — experience rows missing.

- [ ] **Step 7.3: Replace the Experience comment with 9 rows**

In `about/index.html`, replace:

```html
      <h2>Experience</h2>
      <!-- Experience rows land in Task 7 -->
```

with the H2 plus all 9 rows. Each row uses this exact shape:

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-N">
    <span class="when">YYYY – YY</span>
    <span>
      <span class="where">Role title <span class="org">· Org name</span></span>
      <span class="teaser">One-line teaser describing the role.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-N">
    <p>First paragraph of expanded prose (2–3 sentences).</p>
    <p>Optional second paragraph (additional detail).</p>
    <p><span class="stack">Tech</span> <span class="stack">Stack</span> <span class="stack">Chips</span></p>
  </div>
</div>
```

Use unique `aria-controls` / `id` values: `exp-1` through `exp-9`. Match `aria-controls` to body `id` per row.

The 9 rows in order (all closed by default — `aria-expanded="false"`):

**Row 1 — Independent AI coach (2025 – now)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-1">
    <span class="when">2025 – now</span>
    <span>
      <span class="where">Independent AI coach + consultant <span class="org">· crads-ai</span></span>
      <span class="teaser">Working with founders and early-stage companies on AI executive assistants, agents, and data systems.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-1">
    <p>Started with Impact Collab's Expert Pod in late 2025 — eight business owners coached through one-week pods, four detailed proposals delivered. Converted to paying engagements in early 2026.</p>
    <p>Three productised offers: a Single Coaching Session ($150), a four-session Coaching Block ($500), and an EA Basic Build ($2,000) — a full AI executive-assistant install. The pitch is concrete: a mirror you can dump your thoughts into that gives clarity back, while it organises your life.</p>
    <p>The EA system running this site is the live demo.</p>
  </div>
</div>
```

**Row 2 — SEAF / UWA (2025 – 26)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-2">
    <span class="when">2025 – 26</span>
    <span>
      <span class="where">Data Engineer <span class="org">· SEAF / UWA</span></span>
      <span class="teaser">Three-tier data warehouse for environmental impact assessments.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-2">
    <p>Architected an end-to-end data pipeline to lower the barrier to entry for environmental impact assessments. The team's messy multi-source data lake became a three-tier warehouse — raw, processed, analytics-ready — with scientist-facing monitoring interfaces.</p>
    <p>Delivered using Claude Code as an AI development collaborator. The approach was systems-thinking plus rapid iterative delivery in a team used to constrained, precision-first scientific work. The science team's domain knowledge was facilitated into operational tooling rather than replaced.</p>
    <p>One public component: an 8-step river mesh-generation pipeline at github.com/cradsdavis-cell/mesh_generator.</p>
    <p><span class="stack">Python</span> <span class="stack">PostgreSQL</span> <span class="stack">Claude Code</span> <span class="stack">Geospatial</span></p>
  </div>
</div>
```

**Row 3 — University Tutor (2023 – 25)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-3">
    <span class="when">2023 – 25</span>
    <span>
      <span class="where">University Tutor <span class="org">· School of AMME, University of Sydney</span></span>
      <span class="teaser">Engineering Mechanics and Dynamics. Authored a full second-year exam.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-3">
    <p>Three years tutoring second-year engineering students in mechanics and dynamics — small-group teaching, exam-marking, course assistance.</p>
    <p>Known for an engaging, intuitive style and psychological safety in the room. Asked by the course coordinator to author the full second-year exam.</p>
  </div>
</div>
```

**Row 4 — PhD Researcher (2022 – 25)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-4">
    <span class="when">2022 – 25</span>
    <span>
      <span class="where">PhD Researcher <span class="org">· DARE ARC, University of Sydney</span></span>
      <span class="teaser">BayeSpace — applying Bayesian statistics to environmental and ecological phenomena.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-4">
    <p>Three-and-a-half years at the DARE ARC Training Centre developing BayeSpace — a Bayesian statistical framework applied across atmospheric dispersion modelling and species distribution modelling.</p>
    <p>Two novel empirical findings landed in the thesis: oceanic atmospheric dispersion appears more intense than Pasquill–Gifford terrestrial models predict; and a 20% spatiotemporal grid-coverage threshold below which species distribution data becomes unusable.</p>
    <p>Six conferences presented at. Industry placement at Xylo Systems (biodiversity AI startup).</p>
  </div>
</div>
```

**Row 5 — Alan Turing Institute DSG (2022)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-5">
    <span class="when">2022</span>
    <span>
      <span class="where">Facilitator <span class="org">· Alan Turing Institute Data Study Group</span></span>
      <span class="teaser">Led a 10-person AI sprint to master's-level output in one week.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-5">
    <p>One-week sprint with the Centre for Environment, Fisheries and Aquaculture Science (Cefas). Facilitated a team of ten data scientists from scratch to a working pipeline — feature engineering, model selection, presentation — by Friday.</p>
    <p>The sprint shape stuck: take a group through something hard, build safety inside the discomfort, deliver. The same pattern shows up in the AI consulting work and in the Wildly Calm retreats.</p>
  </div>
</div>
```

**Row 6 — Satellite Catapult Applications (2021 – 22)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-6">
    <span class="when">2021 – 22</span>
    <span>
      <span class="where">Intern <span class="org">· Satellite Catapult Applications</span></span>
      <span class="teaser">Antenna array optimisation using a genetic algorithm. Self-taught antenna optics.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-6">
    <p>Six-month placement applying a genetic algorithm to optimise the geometry of a small satellite antenna array. Built the optimiser and a UI to drive it.</p>
    <p>Antenna optics was new — taught it to myself in the first month from journal papers and textbooks. The same self-teaching shape repeats across the career: orbital mechanics at ESA, Bayesian methods at DARE, MCPs and agentic tooling in 2025–26.</p>
  </div>
</div>
```

**Row 7 — Apadmi (2020 – 21)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-7">
    <span class="when">2020 – 21</span>
    <span>
      <span class="where">Graduate Software Developer <span class="org">· Apadmi Ltd</span></span>
      <span class="teaser">First graduate role. Manchester-based mobile development consultancy.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-7">
    <p>Nine months at a mid-sized mobile consultancy after the MPhys. Production iOS and backend work for client projects across retail and logistics.</p>
    <p>Left to take the ESA-shaped academic route into a PhD.</p>
  </div>
</div>
```

**Row 8 — European Space Agency (2019)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-8">
    <span class="when">2019</span>
    <span>
      <span class="where">Intern <span class="org">· European Space Agency, ESTEC</span></span>
      <span class="teaser">FLEX satellite delta-V and propellant budget. Monte-Carlo alternative to the worst-case method. Asked to write a paper.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-8">
    <p>At 22, a summer intern at ESTEC working on the FLEX Earth Explorer mission. Calculated the delta-V budget and propellant requirements for the satellite's operational lifetime.</p>
    <p>Built a probabilistic Monte-Carlo alternative to the standard worst-case method. Asked by the team to write it up as a scientific paper. Orbital mechanics was new — taught it to myself from textbooks in the first three weeks.</p>
  </div>
</div>
```

**Row 9 — Harrow Bangkok gap year (2015 – 16)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="exp-9">
    <span class="when">2015 – 16</span>
    <span>
      <span class="where">Gap Student <span class="org">· Harrow International School, Bangkok</span></span>
      <span class="teaser">A-Level teaching, pastoral care, rock-climbing programme. Charity event organiser.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="exp-9">
    <p>A year between school and university teaching A-Level physics and maths to Year 12 and 13 students at Harrow International Bangkok. Pastoral duties in a boarding house. Ran a weekly rock-climbing programme.</p>
    <p>Organised the school's annual charity event (A4D). First serious teaching experience — the draw was the holistic shaping of young people, not the subject delivery.</p>
  </div>
</div>
```

**Verify before commit:** open `CVs/master-profile.yaml` (EA repo). Cross-check every numerical claim, every "asked to" claim, every date range. Any drift between the prose above and master-profile wins to master-profile.

- [ ] **Step 7.4: Run test to verify it passes**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7.5: Manual voice-check pass**

For each of the 9 expanded `<p>` bodies above, run the 7-check from `.claude/rules/voice-anti-patterns.md`:

1. Contrastive negation count (≤1 per row)
2. Lexical anti-list scan (zero of the 23 forbidden words)
3. Em-dash density (≤2 per paragraph, appositives only)
4. Three-parallel-list count (vary structure if ≥2)
5. Paragraph close audit (concrete or open, not aphoristic)
6. Sentence-length variance
7. Sam-signature presence (Welsh injection, scene anchor, age, fragment, or self-correction — at least one per row where natural)

Fix anything that fires before committing.

- [ ] **Step 7.6: Commit**

```bash
git add about/index.html tests/about.test.js
git commit -m "feat(about): populate Experience — 9 reverse-chronological accordion rows"
```

---

## Task 8: Content — Side practice (Wildly Calm)

**Files:**
- Modify: `about/index.html` (replace the Side practice comment)

- [ ] **Step 8.1: Extend the smoke test**

Append to `tests/about.test.js`:

```javascript
test('side practice block contains Wildly Calm with label', () => {
  const h = readAbout();
  assert.ok(h.includes('Wildly Calm'), 'expected Wildly Calm');
  assert.ok(h.includes('side-practice-label'), 'expected side-practice label badge');
});
```

- [ ] **Step 8.2: Run test to verify it fails**

Run: `npm test` → FAIL.

- [ ] **Step 8.3: Replace the Side practice comment**

In `about/index.html`, replace:

```html
      <h2>Side practice</h2>
      <!-- Wildly Calm row lands in Task 8 -->
```

with:

```html
      <h2>Side practice</h2>
      <div class="about-row" aria-expanded="false">
        <button class="about-row-header" type="button" aria-expanded="false" aria-controls="sp-1">
          <span class="when">2024 – now</span>
          <span>
            <span class="where">Co-founder <span class="org">· Wildly Calm</span><span class="side-practice-label">Side practice</span></span>
            <span class="teaser">Men's retreats combining outdoor adventure with stillness and open conversation. Sydney.</span>
          </span>
          <span class="caret" aria-hidden="true">▸</span>
        </button>
        <div class="about-row-body" id="sp-1">
          <p>Co-founded with Lockie Ranson and Kieran Maguire in 2024. Three retreats run so far — Camp Bunya, Malabar Leaning Circle, Croajingalong — plus ongoing community events.</p>
          <p>The format proven at Croajingalong: take a group through something hard, build a safe container inside the discomfort, expand and learn within it, integrate on the way back. Branding led by Rosie Tobin.</p>
        </div>
      </div>
```

**Verify before commit:** the framing is "co-founder of Wildly Calm" — never "founder" alone. Three named retreats reflect the actual events log in `notes/projects/wildly-calm/README.md`.

- [ ] **Step 8.4: Run test to verify it passes** → `npm test` → PASS.

- [ ] **Step 8.5: Voice-check pass on the two paragraphs above.**

- [ ] **Step 8.6: Commit**

```bash
git add about/index.html tests/about.test.js
git commit -m "feat(about): populate Side practice — Wildly Calm row"
```

---

## Task 9: Content — Builds (8 accordion rows)

**Files:**
- Modify: `about/index.html` (replace the Builds comment)

- [ ] **Step 9.1: Extend the smoke test**

Append to `tests/about.test.js`:

```javascript
test('builds renders all 8 build names', () => {
  const h = readAbout();
  const builds = [
    'EA / Second Brain',
    'Carbon Tracker',
    'Derwen',
    'Owls Eat Rats',
    'TrailMate',
    'The Calm and the Storm',
    'Waste2Wattage',
    'Sasha',
  ];
  for (const b of builds) {
    assert.ok(h.includes(b), `expected build: ${b}`);
  }
});
```

- [ ] **Step 9.2: Run test to verify it fails** → `npm test` → FAIL.

- [ ] **Step 9.3: Replace the Builds comment with 8 rows**

In `about/index.html`, replace:

```html
      <h2>Builds <span class="builds-count">(8 in 12 months)</span></h2>
      <!-- Build rows land in Task 9 -->
```

with the H2 plus 8 rows. Same row shape as Experience. Use `aria-controls`/`id` values `build-1` through `build-8`.

**Row 1 — EA / Second Brain (2026)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-1">
    <span class="when">2026</span>
    <span>
      <span class="where">EA / Second Brain</span>
      <span class="teaser">Personal AI executive assistant — Claude Code, Obsidian, a wide MCP stack. This site is part of it.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-1">
    <p>An eight-layer wiki and a tiered library of about 45 skills, wired to Todoist, Google Workspace, WhatsApp, Slack, Granola, Otter, GitHub, Overleaf, Playwright, Perplexity, Canva, YouTube and Google Maps via MCP.</p>
    <p>It runs the consulting pipeline, the career applications, the daily planning, the decisions log and the public sites — including this one. The EA Basic Build offering is a productised version of the install.</p>
    <p><span class="stack">Claude Code</span> <span class="stack">Obsidian</span> <span class="stack">14 MCPs</span> <span class="stack">Python hooks</span></p>
  </div>
</div>
```

**Row 2 — Carbon Tracker (2025)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-2">
    <span class="when">2025</span>
    <span>
      <span class="where">Carbon Tracker</span>
      <span class="teaser">11-agent SaaS for Greener Edge — PostgreSQL, Climatiq, RAG, audit trail.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-2">
    <p>A carbon-accounting prototype for the UK consultancy Greener Edge. Eleven specialised agents handle scope-by-scope intake, factor lookup against Climatiq, methodology selection, audit logging and the customer-facing report.</p>
    <p>The most sophisticated of the 2025 builds. Never productised — Greener Edge re-engaged on a different shape in 2026.</p>
    <p><span class="stack">PostgreSQL</span> <span class="stack">Climatiq API</span> <span class="stack">RAG</span> <span class="stack">Multi-agent</span></p>
  </div>
</div>
```

**Row 3 — Derwen (2025)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-3">
    <span class="when">2025</span>
    <span>
      <span class="where">Derwen</span>
      <span class="teaser">Biodiversity AI assistant. n8n, Perplexity, GBIF, OpenAI. Live at derwenai.replit.app.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-3">
    <p>A conversational research assistant for biodiversity questions, pulling structured occurrence data from GBIF and synthesising it against Perplexity-sourced literature. Built in n8n.</p>
    <p><span class="stack">n8n</span> <span class="stack">GBIF</span> <span class="stack">Perplexity</span> <span class="stack">OpenAI</span></p>
  </div>
</div>
```

**Row 4 — Owls Eat Rats (2025)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-4">
    <span class="when">2025</span>
    <span>
      <span class="where">Owls Eat Rats</span>
      <span class="teaser">AI wildlife monitoring — YOLOv8, Bayesian inference, LLM-driven reports.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-4">
    <p>A detection pipeline for nocturnal wildlife cameras. YOLOv8 for the species classifier, a Bayesian layer for confidence-aware aggregation, an LLM for the human-readable site report.</p>
    <p>Project lead with two interns. Concept stage in late 2025.</p>
    <p><span class="stack">YOLOv8</span> <span class="stack">Bayesian</span> <span class="stack">LLM</span></p>
  </div>
</div>
```

**Row 5 — TrailMate (2025)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-5">
    <span class="when">2025</span>
    <span>
      <span class="where">TrailMate</span>
      <span class="teaser">Conversational AI for finding second-hand outdoor gear. Concept spec.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-5">
    <p>A natural-language interface over second-hand outdoor-gear marketplaces. Describe the trip and the budget, get matched listings with a fit assessment. Spec only.</p>
  </div>
</div>
```

**Row 6 — The Calm and the Storm (2025)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-6">
    <span class="when">2025</span>
    <span>
      <span class="where">The Calm and the Storm</span>
      <span class="teaser">Digital Wildly Calm companion. App concept.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-6">
    <p>A companion app for the Wildly Calm retreat methodology — daily prompts, breathing practice, a place to sit with the post-retreat integration. Concept stage.</p>
  </div>
</div>
```

**Row 7 — Waste2Wattage (2024)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-7">
    <span class="when">2024</span>
    <span>
      <span class="where">Waste2Wattage</span>
      <span class="teaser">Pyrolysis startup concept. Origin story in Kyrgyzstan and Lombok.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-7">
    <p>A pyrolysis-as-energy concept aimed at rural waste-management in low-income geographies. The origin pre-dates the AI builds — Kyrgyzstan 2021 and Lombok 2023 surfaced the same problem twice. Concept stage.</p>
  </div>
</div>
```

**Row 8 — Sasha (2025)**

```html
<div class="about-row" aria-expanded="false">
  <button class="about-row-header" type="button" aria-expanded="false" aria-controls="build-8">
    <span class="when">2025</span>
    <span>
      <span class="where">Sasha</span>
      <span class="teaser">EA system predecessor. GPT plus Notion. Superseded by the current build.</span>
    </span>
    <span class="caret" aria-hidden="true">▸</span>
  </button>
  <div class="about-row-body" id="build-8">
    <p>A first attempt at the executive-assistant pattern in early 2025 — GPT over a Notion knowledge base. Worked enough to surface the right shape, not enough to be reliable. Superseded by the Claude Code build in late 2025.</p>
  </div>
</div>
```

**Verify before commit:** for each build, cross-check against `notes/concepts/<build-slug>.md` in the EA repo. Drop any claim the concept page doesn't back. "14 MCPs" in Row 1 should be checked against the current MCP inventory in `notes/_layers/8-workflow.md § MCPs` and updated to the actual count, or softened to "a wide MCP stack" if churn is fast.

- [ ] **Step 9.4: Run test to verify it passes** → `npm test` → PASS.

- [ ] **Step 9.5: Voice-check pass on every expanded paragraph above** (7-check).

- [ ] **Step 9.6: Commit**

```bash
git add about/index.html tests/about.test.js
git commit -m "feat(about): populate Builds — 8 rows for the 12-month portfolio"
```

---

## Task 10: Manual cross-browser + responsive check

**Files:** none modified.

- [ ] **Step 10.1: Start a local server**

Run: `npx serve .` (or `python -m http.server 8000`).

- [ ] **Step 10.2: Desktop check (width ≥ 1280px)**

Open `http://localhost:3000/about` (or the equivalent). Verify:

1. Nav shows 5 items: Home · Overview · About (marked current) · Offer · Book →
2. Layout is two columns: identity rail left, accordion right.
3. Scroll down: sidebar pins below the top nav and stays visible.
4. Click any Experience row: row expands, caret rotates 90°, body content shows.
5. Click again: row collapses, caret rotates back.
6. Tab to a row header with the keyboard: focus ring appears (brass outline).
7. Press Enter or Space with a row focused: it toggles.
8. Footer shows wordmark + email + LinkedIn + Book a call link + location.

- [ ] **Step 10.3: Mobile check (width ≤ 600px)**

Resize the window or use devtools mobile mode. Verify:

1. Grid collapses to single column.
2. Identity rail stacks above main column (no longer sticky).
3. Accordion rows still toggle on tap.
4. No horizontal scroll.

- [ ] **Step 10.4: Cross-page nav check**

Visit `/`, `/overview`, `/offer`, `/book`, `/thanks`, `/booking-failed`, each `/book/*` subpage. Each must show the 5-item nav with About between Overview and Offer.

- [ ] **Step 10.5: JS regression check**

Visit `/`, `/overview`, `/offer`. Open browser console. No JS errors. The existing initialisations (italic-morph, scroll-reveal, smooth-scroll, typewriter) still fire on the pages that use them.

- [ ] **Step 10.6: No commit needed unless an issue surfaces.**

If a manual check fails, file a bug as a Task-N+ append below, fix, and commit per the usual TDD shape.

---

## Task 11: Final voice-check + ship

**Files:**
- Possibly modify: `about/index.html` (voice-check fixes)

- [ ] **Step 11.1: Run the full 7-check across all expanded prose**

Read every `<p>` body in `about/index.html`. Apply each of the 7 checks from `.claude/rules/voice-anti-patterns.md`:

1. **Contrastive negation count** — rewrite if ≥2 in the doc.
2. **Lexical anti-list scan** — search-replace the 23 forbidden words. Common offenders in CV prose: *leverage*, *navigate*, *crucial*, *robust*, *comprehensive*, *furthermore*, *delve*, *journey*, *deep dive*.
3. **Em-dash density** — limit 2 per paragraph; appositives only.
4. **Three-parallel-list count** — vary structure if ≥2 stacked.
5. **Paragraph close audit** — concrete or open; strike chiastic aphorism closes.
6. **Sentence-length variance** — break the uniform 12–20 word rhythm.
7. **Sam-signature presence** — Welsh injection, scene anchor, first-person past with age, sentence fragment list, self-correction — at least one across the page where natural (the ESA paragraph already carries the age anchor *"At 22"*).

Fix anything that fires. Save.

- [ ] **Step 11.2: Run final smoke test**

Run: `npm test`

Expected: PASS — full suite green.

- [ ] **Step 11.3: Stage all final changes + commit**

```bash
git add about/index.html
git commit -m "polish(about): voice-check pass — remove AI-register tells, tighten prose"
```

- [ ] **Step 11.4: Push**

```bash
git push origin main
```

Vercel auto-deploys. Verify `https://crads-ai.com/about` renders correctly within ~60 seconds of the push.

---

## Self-review (against the spec)

| Spec section | Covered by |
|---|---|
| Goal — long-form CV-shape /about | Tasks 1, 6–10 |
| Audience + positioning (honest, voice-check, no Wellington, pure CV register, Welsh as biographical fact) | Tasks 7–11, especially the voice-check gate per content task + Task 11 final sweep |
| Nav placement (5 items, About between Overview and Offer, 10 pages) | Task 2 |
| Page structure (two-col grid, sticky sidebar, footer strip) | Tasks 1, 3 |
| Section contracts — identity rail (Skills · Education 3 · Recognition 3) | Task 6 |
| Section contracts — Experience (9 rows) | Task 7 |
| Section contracts — Side practice (Wildly Calm with label) | Task 8 |
| Section contracts — Builds (8 rows) | Task 9 |
| Section contracts — Footer (wordmark · email · LinkedIn · book · location) | Task 1 (skeleton) |
| Accordion interaction (collapsed default, click + keyboard, aria-expanded, focus ring) | Tasks 4 + 5 |
| Mobile (single-column stack at ≤900px) | Tasks 3, 10 |
| Visual / typography (existing tokens, no new design tokens) | Tasks 3, 4 |
| File layout (about/index.html, lib/site.css append, lib/site.js append, 10 nav pages) | Tasks 1–9 |
| Content writing rules (master-profile-as-source, voice-check, no marketing-speak, verify specific facts) | Tasks 6–11 (each task names the verification step) |
| Out of scope (no photo, no /overview deep-link, no anchor-linking, no print stylesheet) | Honoured by absence |

**Placeholder scan:** every step contains the actual code/content to write. No TODOs, no "implement appropriately." The voice-check fix steps name specific words to search for.

**Type consistency:** function name `initAboutAccordion()` matches between Task 5 definition and init-block call. CSS class names (`about-row`, `about-row-header`, `about-row-body`, `about-sidebar`, `about-main`, `about-grid`, `about-page`) are consistent across Tasks 3, 4, 6–9. `aria-controls` / `id` pairs are consistent (`exp-N`, `sp-N`, `build-N`).

**Scope:** single page + 10-file nav touch + ~150 lines of CSS + ~30 lines of JS. Single subsystem. No decomposition needed.

---

## Execution

Plan complete and saved to [docs/superpowers/plans/2026-05-31-crads-ai-about-page.md](2026-05-31-crads-ai-about-page.md). Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
