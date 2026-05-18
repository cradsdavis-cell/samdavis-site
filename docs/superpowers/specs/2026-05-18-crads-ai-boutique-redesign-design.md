# crads-ai.com Boutique Redesign — Design Spec

**Date:** 2026-05-18
**Status:** Brainstorm complete; awaiting user review before transitioning to writing-plans
**Scope:** Full redesign of crads-ai.com (5 founder-side pages) into strategy-boutique register
**Target audience:** Impact Founders (climate / ESG / social-impact, scaling 1-10M, design-literate, time-poor)
**Bridge window:** Site runs 7 months as primary AI-consulting surface (now → Dec 2026), then handover surface as Wellington Jan 2027 starts

---

## Goal

Move crads-ai.com from "competent dev-built static site" to "strategy-boutique professional brand surface" comparable in register to anthropic.com, sequoiacap.com, and stripe.press — without LARPing as a multinational consulting firm, without violating stay-within-ability-level, and without depending on the Wellington Jan 2027 broadcast.

## Context

### Current state (as of 2026-05-18)

- 5 pages: `/`, `/overview`, `/offer`, `/book`, `/onepager`
- 2 demoted pages (kept for inbound links): `/build`, `/build-onepager`
- Stack: vanilla HTML + CSS + JS; Vercel serverless functions for Stripe webhook + Cal API + Resend email
- 13/13 tests green
- First paying client through the funnel: Alex Mills, 2026-05-15, $500 Coaching Block
- 3 more discovery calls in pipeline (Angela / Sasha / Yvette, Wed/Thu AEST)
- CSS duplicated across 5 pages (no shared design tokens)
- Existing Canva-built logo uses dated silhouette + tech-nature graphic + "Environmental and Social AI Solutions" tagline

### Research filed during brainstorm

- [notes/research/samdavis-ai-professional-design-2026.md](../../../EA/notes/research/samdavis-ai-professional-design-2026.md) — 2026 boutique register patterns + anti-patterns
- Two Perplexity sweeps (positive patterns + anti-patterns) — see decisions log 2026-05-18

### Constraints

- Stay-within-ability-level: every claim traces to master-profile.yaml or wiki page
- Voice rules: see `.claude/rules/voice-anti-patterns.md`
- Bridge framing: site is income surface for 7 months, then handover. Don't overinvest in long-arc brand
- Wellington Jan 2027 acceptance is private knowledge — does NOT broadcast on site
- Existing Stripe + Cal + Resend infrastructure works and must not break

---

## Locked decisions (from brainstorm Q&A)

| # | Decision | Locked value | Source |
|---|---|---|---|
| Q1 | Register | Strategy boutique (B) — Sequoia / Anthropic / Stripe Press DNA | User pick |
| Q2 | Scope | Full system redesign across 5 pages (A) | User pick |
| Q3 | Taste anchors | Sequoia + Anthropic + Linear motion polish | User multi-select |
| Q4 | Voice intensity | Boutique + signature voice (B) | User pick |
| Q5 | Funnel priority | Founder primary; B2B demoted (A) | User pick |
| Q6 | Content go/no-go | PhD + MPhys + 8 builds + Carbon Tracker + Derwen + EA system + Abbey-permission-pending. NOT Greener Edge, SEAF, Impact Collab, Alex Mills, Owls Eat Rats, TrailMate by name | User multi-select |
| Q7 | Landing architecture | Anthropic-style essay (single long-form, no card grid) | User pick |
| Q8 | Motion intensity | Linear-on-serif signature (B) — italic morph + scroll reveal + button micros + smooth scroll | User pick |
| Q9 | Logo direction | Edit 2 Nano Banana illustration + Playfair Display CSS wordmark | User pick |

---

## Architecture

```
PRIMARY SURFACES (linked from nav)
├── /              Essay landing (Anthropic-shape, founder-primary)
├── /overview      EA demo / proof (essay-shape, switched from slide-deck)
├── /offer         Founder ladder pitch (essay-shape, switched from slide-deck)
├── /book          Payment-gated Cal+Stripe booking (unchanged structure, CSS-swap only)
└── /onepager      Print PDF (palette + illustration swap, structure unchanged)

DEMOTED (kept for inbound links, removed from primary nav)
├── /build         B2B Fractional AI Lead page
└── /build-onepager  B2B print PDF
```

Decision rationale:
- `/case-studies/carbon-tracker` NOT built — Carbon Tracker embedded as a section on `/overview` instead. Reserve standalone case-study pages for when ≥3 are ready.
- `/build` not deleted — inbound links from LinkedIn / past one-pager-shares would 404. Demoted but URL-stable.

---

## Design system

### Typography

| Role | Family | Weight | Size | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| H1 (hero) | Playfair Display | 800 | `clamp(40px, 6vw, 72px)` | 1.05 | -0.015em |
| H2 (section) | Playfair Display | 800 | `clamp(32px, 4vw, 48px)` | 1.1 | -0.01em |
| H3 (subsection) | Playfair Display | 700 | 24-28px | 1.2 | -0.005em |
| Body | Inter | 400-500 | 18px (16px mobile) | 1.65 | 0 |
| Lede (hero sub) | Inter | 400 | `clamp(18px, 1.6vw, 23px)` | 1.5 | 0 |
| Small | Inter | 400 | 14.5px | 1.55 | 0 |
| Eyebrow | ui-monospace | 600 | 12px | 1.4 | 0.22em uppercase |
| Metadata | ui-monospace | 500 | 13px | 1.4 | 0.05em |

Type scale: major-third (1.25). Two-family discipline — no third typeface anywhere.

### Palette tokens (CSS variables)

```css
--bg-main: #FAF7EE;      /* cream — Anthropic-warm */
--bg-soft: #F2EEDD;      /* section alternate */
--bg-card: #DCE0B6;      /* olive — used sparingly */
--ink-deep: #3E3418;     /* body + heading warm brown */
--ink-soft: #6B5F3A;     /* subhead / lede */
--ink-faint: #998D6B;    /* metadata */
--accent: #8F7530;       /* brass — single accent */
--accent-deep: #6B5624;  /* brass hover */
--rule: #B0B490;         /* borders + dividers */
--good: #7A8B3F;         /* leaves green — only in logo + ship indicators */
```

Strict palette discipline: one accent (brass), one supporting nature color (leaves green) used only in the logo illustration and rare ship-indicators. No additional colors.

### Spacing tokens

```css
--space-1: 8px;     /* tight gaps */
--space-2: 16px;    /* body rhythm */
--space-3: 24px;    /* subsection gap */
--space-4: 40px;    /* section internal */
--space-5: 72px;    /* section break mobile */
--space-6: 120px;   /* section break desktop */
--space-7: 200px;   /* hero top padding */
```

Side padding: 120px desktop / 64px tablet / 24px mobile.
Content wrapper max: 1100px.
Reading column for prose: 640px.

### Motion philosophy

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Scroll reveal | fade-in + translateY 12px | 600ms | ease-out, 80ms stagger between children |
| CTA button hover | color shift + 6px arrow nudge + 0.99 scale | 200ms | ease |
| Card hover | translateY -3px + shadow grow | 200ms | ease |
| Anchor scroll | smooth scroll | — | cubic-bezier(0.2, 0.8, 0.2, 1) |
| H1 italic morph | crossfade through phrases | 4s loop, 0.6s fade | ease-in-out |
| Logo float (landing hero) | translateY 0 → -4px → 0 | 4s loop | ease-in-out infinite |
| Logo hover | scale 1.02 + brass drop-shadow | 300ms | ease |

H1 italic morph phrases (default): "chief of staff" → "longtime colleague" → "thoughtful editor"

`prefers-reduced-motion`: disables all motion. Retains hover-state color/shadow changes only.

### Logo integration

Source asset: `c:/tmp/nano-edit-2-illustration-only.png` (Nano Banana Edit 2, 720KB PNG)

Optimised variants written to repo:
```
/lib/img/sam-illustration.png      Full-size, optimised PNG (target <200KB) or JPEG with baked cream bg
/lib/img/sam-illustration-sm.png   320px wide, ~50KB
/lib/img/favicon.png               Cropped to just the tech-nature icon, 64×64
/lib/img/favicon.ico               Standard 16/32/48 multi-resolution
```

Placement:
- **Nav top-left:** illustration at 36px height + Playfair Display "Sam Davis." wordmark
- **Landing hero:** illustration at 280px height, left-aligned, paired with H1 + body right-aligned
- **Overview/Offer hero:** smaller illustration (140px height) + H1 only
- **Footer:** wordmark only, no illustration

Animation: gentle float on landing hero; static everywhere else; hover scale 1.02 + brass drop-shadow.

### Shared CSS extraction

```
/lib/site.css   Palette tokens + typography + spacing + motion utility classes (~250 lines)
/lib/site.js    Italic morph + scroll observer + smooth anchor scroll (~40 lines vanilla JS)
```

Every page imports `/lib/site.css` and `/lib/site.js`. Per-page CSS is minimal overrides only.

---

## Page specifications

### `/` Landing

Anthropic essay shape — single long-form scroll, no card grid.

**Hero (above fold)**
- Left: illustration at 280px height (animated float)
- Right:
  - Eyebrow: `SAM DAVIS · PhD ENVIRONMENTAL DATA SCIENCE · 8 AI BUILDS IN 12 MONTHS`
  - H1: `An AI executive assistant that knows you the way a chief of staff would.`
    - Italic morph on "chief of staff"
  - Lede: `I build AI that learns your voice, your people, your priorities — for founders who want their AI to actually understand them.`
  - Primary CTA: `Book a 30-minute call →` (solid brass)
  - Secondary CTA: `See the work` (text link)
  - Inline proof (italic small): `Eight AI systems shipped in twelve months — Carbon Tracker for a UK climate consultancy, Derwen, the system running this site.`

**§ How I work**
- 4 short prose paragraphs introducing the 3 rungs:
  - Coaching Block · $500 / 4 sessions — "build alongside me"
  - EA Basic Build · $2,000 fixed / 1 week — "I install your assistant"
  - Layers · $500–800 / capability — "async additions afterwards"
- Section close: `→ See the full offer` (link to /offer)

**§ Selected work**
- Prose intros (not card grid):
  - Carbon Tracker — 11-agent system for UK climate consultancy. ~6 weeks. Three sentences on what it does + outcome.
  - Derwen — live AI biodiversity assistant. derwenai.replit.app.
  - This system — the EA running this site. Live demo on prospect calls.
- Closing line: `Five more builds rounded out the twelve months: gear-finder, wildlife-monitoring, climate-data tooling. Happy to walk through any of them on a call.`

**§ Final CTA**
- One short paragraph: `If any of this is the shape of what you've been trying to build —`
- CTA: `Book a 30-minute call. No pitch.`

**Footer**
- Wordmark `Sam Davis.` (no illustration)
- Email · LinkedIn · phone
- Location: `Coogee, Sydney.` (no date)

### `/overview`

Essay shape (converted from slide-deck). Hero + 6 sections.

**Hero:** Smaller illustration (140px) + H1: `What an AI that knows you actually does.`

**Sections:**
1. **It knows me** — 2 paragraphs + architecture diagram of layers
2. **It knows my people** — 2 paragraphs + example tier-system snippet
3. **It writes in my voice** — 2 paragraphs + before/after copy snippet (this is where the Abbey quote goes if/when permission lands)
4. **It catches drift** — 2 paragraphs on lint / sync / self-healing reflexes
5. **It uses the right tool** — 2 paragraphs on skills + MCPs
6. **Carbon Tracker (embedded case study)** — 3-4 paragraphs

**CTA:** `Book a call to see this run live.`

### `/offer`

Essay shape (converted from slide-deck). Hero + 3 rung sections + closer.

**Hero:** Smaller illustration + H1: `How we work together.`

**Sections:**
- **Coaching Block** — outcome + who it's for + what's in the 4 sessions + $500. CTA → `/book#coaching-block`
- **EA Basic Build** — outcome + who it's for + what ships in the week + $2,000. CTA → `/book#ea-basic-build`
- **Layers** — what gets added afterwards + examples + $500-800. CTA → email/scope-call
- **Start with a call** — `Discovery is free. 30 minutes.` CTA → `/book#discovery`

### `/book`

Structure unchanged. CSS-swap only (palette + typography tokens applied via shared `/lib/site.css`).

QA imperative: existing Stripe webhook + Cal API integration must remain green. All 13 existing tests pass.

### `/onepager`

Print A4 PDF. Content unchanged. Apply new palette + swap illustration to cropped Edit 2.

### Demoted `/build`, `/build-onepager`

Apply shared CSS (palette + typography sweep). Remove from primary nav. Add small footer link back to `/`. No content rewrites.

---

## Mobile responsive

```
> 1100px         Two-column hero (illustration left, copy right). Full grid.
900-1100px       Two-column compressed.
600-900px        Hero stacks: illustration above, copy below.
< 600px          Body 16px. Illustration 180px max. CTAs full-width.
                 Section spacing 56px. Side padding 24px.
```

Tap targets: 44px minimum (Apple HIG).
`prefers-reduced-motion`: kills floats + scroll-reveals. Hover state changes still fire.

---

## Implementation plan

### Phases

```
PHASE 1 · Foundation                                                    ~2h
  ☐ Extract palette + typography + spacing tokens → /lib/site.css
  ☐ Build /lib/site.js (italic morph + scroll observer + smooth scroll)
  ☐ Optimise illustration: full + sm + favicon variants
  ☐ Verify shared CSS imports cleanly across all pages

PHASE 2 · Landing rebuild                                               ~4-5h
  ☐ Rebuild /index.html from scratch in essay shape
  ☐ Hero with paired illustration + italic morph
  ☐ How-I-work prose section
  ☐ Selected-work prose section
  ☐ Final CTA section
  ☐ Footer
  ☐ Mobile responsive at 600/900/1100
  ☐ Manual QA: Chrome + Firefox + Safari + iOS + Android

PHASE 3 · /overview restructure                                         ~3h
  ☐ Convert slide-deck → essay shape
  ☐ Six sections + embedded Carbon Tracker case study
  ☐ Apply shared CSS + motion
  ☐ Architecture diagrams for sections 1 and 5

PHASE 4 · /offer restructure                                            ~3h
  ☐ Convert slide-deck → essay shape
  ☐ Three rung sections + start-with-a-call CTA
  ☐ Wire per-rung CTAs to /book#<product-anchor>

PHASE 5 · /book                                                         ~1h
  ☐ Apply shared CSS only
  ☐ Run full 13/13 test suite (Stripe + Cal still green)
  ☐ End-to-end manual booking on $0.50 test product

PHASE 6 · /onepager + demoted pages                                     ~2h
  ☐ Onepager: palette + illustration swap
  ☐ /build + /build-onepager: shared CSS sweep + nav removal
  ☐ Verify print PDF generates cleanly

PHASE 7 · Staging + QA                                                  ~2h
  ☐ Vercel preview deploy
  ☐ Lighthouse audit (target 95+ all 4 metrics)
  ☐ WCAG AA contrast audit
  ☐ Keyboard nav + focus state audit
  ☐ prefers-reduced-motion verification
  ☐ Real-device test (iOS Safari + Android Chrome)
  ☐ Print preview /onepager
  ☐ Verify /build URL still resolves

TOTAL                                                                   ~17-18h
                                                                        Realistic: 2 days focused work
```

### Branch strategy

```
Base:     main
Branch:   feat/boutique-redesign-2026-05
Commits:  one per phase, conventional-commit prefixes (feat/refactor/style/fix/chore)
Review:   /gsd:code-review on branch before merge
PR:       single PR; user reviews Vercel preview before approving merge
Merge:    squash-merge to main → auto-deploys to crads-ai.com
Rollback: `git revert HEAD` on main; Vercel re-deploys prior build <90s
```

### Staging

Every push → Vercel preview deploy (automatic, unique URL per commit). No `/v2` path in repo. User reviews previews at phase checkpoints. Existing crads-ai.com stays live until explicit approval to flip.

### QA gates (all must pass before merge)

- ✓ All 13 existing tests green (Cal API + Stripe webhook)
- ✓ Manual end-to-end booking works (Stripe test mode)
- ✓ Lighthouse 95+ on Performance + Accessibility + Best Practices + SEO (mobile + desktop)
- ✓ WCAG AA contrast on every text-on-bg pair
- ✓ Keyboard nav reaches every interactive element with visible focus states
- ✓ `prefers-reduced-motion` disables animations cleanly
- ✓ iOS Safari + Android Chrome (real device) test passes
- ✓ Print preview /onepager produces correct A4 PDF
- ✓ Old `/build` URL still resolves (no 404)

### What I do vs what user does

| Me | User |
|---|---|
| Phase 1-7 implementation | Review Vercel preview at each phase milestone |
| /gsd:code-review on branch | Walk full funnel on phone end-to-end before approval |
| Lighthouse + accessibility audits | Approve merge to main |
| Run 13-test suite | Ask Abbey for endorsement-quote permission (separate track) |
| Push commits to feature branch | Confirm production-swap timing |

### Risk register

| Risk | Mitigation |
|---|---|
| Stripe webhook breaks post-CSS swap | Phase 5 dedicated to /book. Full test suite + manual booking before merge. Low probability (CSS-only). |
| Mobile Safari quirk in float animation | Explicit iOS Safari test in Phase 7. Fallback: static illustration. |
| Illustration PNG performance hit (~720KB) | Phase 1 optimisation: serve 320px-wide version below 900px viewport. Consider JPEG with baked cream background (~50KB). |
| Vercel domain swap downtime | Vercel atomic swaps propagate <90s. Time the swap outside Wed/Thu discovery-call slots (Tuesday evening or Friday morning AEST). |

---

## Open items (tracked, not blockers)

1. **Abbey endorsement quote** — user asks Abbey for permission separately. Lands on /overview "It writes in my voice" section. ~2 min edit on permission. Not blocking launch.

2. **Italic-morph phrases** — defaults: "chief of staff" → "longtime colleague" → "thoughtful editor". User may propose alternatives.

3. **Wellington Jan 2027 broadcast timing** — never auto-surfaced. User's call when (if ever) to publish the move.

4. **Logo iteration** — Edit 2 locked for v1. Asset is a single PNG swap if user re-runs Nano Banana with refined prompts later.

5. **Carbon Tracker case study deepening** — embedded on /overview for v1. /case-studies/carbon-tracker is future scope (when ≥3 case studies justify dedicated pages).

## Future scope (out of v1)

- /writing or /essays section (Stripe Press-style)
- Dedicated /case-studies/<slug> deep-dive pages
- Newsletter / Substack integration
- Dark mode
- Designer-led logo polish via Figma + human professional
- /about page with manuscript-register biographical depth

## Final assumptions (explicit, flag before spec-write)

- Footer = contact + location only. No copyright, no secondary nav links.
- Primary nav across pages = Home · Overview · Offer · Book.
- /onepager demoted to a small `↓ PDF` link in hero or footer.
- No newsletter signup form anywhere.
- No social-media follow buttons.
- All metric claims trace to master-profile.yaml or wiki page.
- Hero illustration → JPEG with baked cream background if PNG performance audit fails.

---

## Success criteria

The redesign succeeds if:

1. **Visual:** crads-ai.com reads as comparable in register to anthropic.com / sequoiacap.com (subjective; user's judgement at the Vercel preview gates)
2. **Functional:** all 13 existing tests pass; one end-to-end booking confirms on Stripe test mode
3. **Performance:** Lighthouse ≥95 on all 4 metrics, mobile + desktop
4. **Accessibility:** WCAG AA contrast + full keyboard navigation + `prefers-reduced-motion` honoured
5. **Honesty:** every claim on the site traces to master-profile.yaml or a wiki page
6. **Conversion:** funnel still works end-to-end on prod after swap; Alex Mills's existing booking-link remains valid

## Next step

User reviews this spec. On approval, transition to `superpowers:writing-plans` skill to produce the granular implementation plan (the ticket list for Phase 1-7).

— end of spec —
