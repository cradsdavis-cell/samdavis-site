# crads-ai.com — /about page design

**Date:** 2026-05-31
**Status:** approved spec, ready for plan
**Site:** crads-ai.com (cradsdavis-cell/samdavis-site)

---

## Goal

A long-form CV-shape `/about/` page for crads-ai.com — Sam's canonical web CV, generic across audiences (no commercial tilt). Discoverable from the top nav as a 5th item between Overview and Offer. Doesn't compete with `/overview` (essay-shape narrative) or `/build` (B2B presentation) — it's the factual record.

The page must scan in one screen when closed (accordion default) AND carry the full depth when expanded. Closed state ≈ 700 words; fully expanded ≈ 3,000 words.

## Audience + positioning constraints

**Audience:** generic. Master-profile-shape, no audience tilt. Read by recruiters, prospects, school colleagues, LinkedIn DMs, anyone Googling Sam.

**Positioning rules (load-bearing):**

1. **Honest positioning** — every claim must trace to `CVs/master-profile.yaml` or a wiki page. No inflated framings. (Per project rule `.claude/rules/check-before-edit.md` + auto-memory `feedback_stay_within_ability_level`.)
2. **Voice-check applies** — page content runs through the 7-check at draft time (per `.claude/rules/outbound-draft-voice-check.md`). No AI register tells; concrete > abstract; Sam-signature moves where natural.
3. **Don't surface Sam's internal certainty** — Wellington Jan 2027 / specific client names / specific UK move date stay off the public page. Availability framed neutrally as *"Currently in Sydney."* (Per auto-memory `feedback_match_sams_internal_certainty`.)
4. **Pure CV register, no sell** — page ends with a quiet contact strip. No book-a-call hook, no Coaching Block CTA. The rest of the site does conversion.
5. **Welsh identity is biographical fact, not decoration** — *Samuel Caradog Davis* in the header. Ysgol y Moelwyn as Welsh-medium state comprehensive in Education. No translated injections.

## Information architecture

**New top-nav structure (5 items, all pages):**

```
Home · Overview · About · Offer · Book →
```

About sits between Overview and Offer — identity-context after the essay-shape Overview but before the commercial Offer. Reads as the *who* before the *what they sell*.

The nav must be updated on every page that uses the canonical site-nav-bar: `index.html`, `overview/index.html`, `offer/index.html`, `book/index.html` (and `book/coaching-block/index.html`, etc. — check repo for the full list), `thanks.html`, `booking-failed.html`. `onepager/index.html`, `build/index.html`, `build-onepager/index.html` use their own nav patterns — leave alone.

## Page structure

Two-column grid below the shared site nav:

```
┌───────────────────────────────────────────────────────────┐
│  [nav-bar with Home · Overview · About* · Offer · Book →] │  sticky
├──────────────────┬────────────────────────────────────────┤
│                  │                                        │
│  IDENTITY RAIL   │  MAIN COLUMN                           │
│  (sticky)        │  (scrolls past the rail)               │
│                  │                                        │
│  Samuel          │  Experience                            │
│  Caradog Davis   │    [row · accordion]                   │
│                  │    [row · accordion]                   │
│  Role line       │    ...                                 │
│                  │                                        │
│  Summary         │  Side practice                         │
│  (2-3 lines)     │    [Wildly Calm row]                   │
│                  │                                        │
│  Skills          │  Builds (8 in 12 months)               │
│  (pills)         │    [row · accordion]                   │
│                  │    ...                                 │
│  Education       │                                        │
│  (3 entries)     │                                        │
│                  │                                        │
│  Recognition     │                                        │
│  (3 entries)     │                                        │
│                  │                                        │
├──────────────────┴────────────────────────────────────────┤
│  Footer strip — quiet contact (email · LinkedIn · book)   │
└───────────────────────────────────────────────────────────┘
```

**Sticky behaviour:** sidebar pins to the top of the viewport (below the site nav) once the user scrolls past it. Implemented via `position: sticky; top: <nav-height>px;`. On `align-self: flex-start` inside the grid.

**Grid ratio:** sidebar ~30–35%, main ~65–70% (`grid-template-columns: 0.55fr 1.45fr` in v3 mock — refine in implementation).

## Section contracts

### Identity rail (sidebar)

| Element | Content | Source |
|---|---|---|
| H1 | "Samuel Caradog Davis" — line-break after first name; Playfair serif; brass-blue colour | master-profile.yaml |
| Role | "Data scientist · AI builder" — small caps, brass | static |
| Summary | 2–3 lines · brass left-border accent | draft below |
| **Skills** | Pill list, ~10 items | master-profile.yaml |
| **Education** | 3 entries with dates · PhD, MPhys, Ysgol y Moelwyn | master-profile.yaml |
| **Recognition** | 3 entries · Pik Perseverance team member · XXI Club · Mountaineering Society Captain | master-profile.yaml; honour the `feedback_kyrgyzstan_team_member_not_leader` rule |

**Summary draft (verify in voice-check at implementation time):**

> "PhD environmental data scientist. 8 AI builds in 12 months. Translator and pathfinder by fingerprint — bridges deep technical systems and real-world impact."

### Main column

Three labelled blocks: **Experience**, **Side practice**, **Builds**.

#### Experience (9 entries, reverse-chronological)

Each entry is a collapsible row.

| Closed state | Expanded state |
|---|---|
| Date · Role · Org · 1-line teaser | Date · Role · Org · 2–4 sentence paragraph + optional `<span class="stack">` tech-stack chips |

Order:

1. **2025 – now** · Independent AI coach + consultant · crads-ai
2. **2025 – 26** · Data Engineer · SEAF / UWA
3. **2023 – 25** · University Tutor · AMME, USYD
4. **2022 – 25** · PhD Researcher · DARE ARC, University of Sydney
5. **2022** · Facilitator · Alan Turing Institute DSG
6. **2021 – 22** · Intern · Satellite Catapult Applications
7. **2020 – 21** · Graduate Software Developer · Apadmi Ltd
8. **2019** · Intern · European Space Agency
9. **2015 – 16** · Gap Student · Harrow International School, Bangkok

#### Side practice (1 entry, labelled)

Wildly Calm — gets the *"side practice"* label badge so the reader knows it's not bill-paying. Same row shape as Experience.

- **2024 – now** · Co-founder · Wildly Calm — men's retreats; outdoor adventure + stillness + open conversation; Sydney.

#### Builds (8 entries, "8 in 12 months" subhead)

Same row shape. Two-column compact grid acceptable for visual density (per v3 mock), or single-column accordion same as Experience — **implementer's call based on what reads better at responsive widths.** Default to single-column accordion for consistency.

1. **EA / Second Brain** · 2026 — Claude Code + Obsidian + wide MCP stack
2. **Carbon Tracker** · 2025 — 11-agent SaaS · Greener Edge
3. **Derwen** · 2025 — Biodiversity AI assistant
4. **Owls Eat Rats** · 2025 — YOLOv8 + Bayesian wildlife monitoring
5. **TrailMate** · 2025 — Conversational outdoor-gear finder (concept)
6. **The Calm and the Storm** · 2025 — Digital Wildly Calm companion (concept)
7. **Waste2Wattage** · 2024 — Pyrolysis startup concept
8. **Sasha** · 2025 — EA predecessor, GPT + Notion, superseded

### Footer strip

Full-width below the grid:

> *"Currently in Sydney. cradsdavis@gmail.com · linkedin.com/in/samuel-davis4 · book a 30-min call →"*

Background brass-cream tint (`#ece2cc`), brass-blue links, no sell.

## Accordion interaction

**Default state:** all rows collapsed.

**Behaviour:**
- Row header is the click target (entire header row, not just a button).
- Caret (`▸`) on the right rotates 90° on expand (CSS transform).
- Body slides open with a height transition (CSS `max-height` + `transition`).
- Expanded state is purely client-side — no URL hash, no server round-trip.

**Optional progressive enhancement (defer to plan):** anchor links like `/about#experience-seaf` could open the matching row on page load. Not required for v1.

**Accessibility:**
- Row headers use `<button>` semantics (or `role="button"` + `tabindex="0"` if structural HTML can't be a button).
- `aria-expanded` toggles true/false on the header.
- `aria-controls` points to the body's id.
- Body has `id` matching the aria-controls value.
- Enter / Space on focused header toggles.

## Mobile behaviour

Breakpoint: same as existing site (check `lib/site.css` for canonical breakpoint — likely 768px).

Below breakpoint:
- Grid collapses to single column.
- Sidebar appears above main (identity → summary → skills → education → recognition).
- Sidebar is no longer sticky (would take too much vertical space).
- Main column follows below.
- Footer strip stays at bottom.

## Visual / typography

Inherit from existing `lib/site.css`:

- **Palette:** cream `#F5EFE3` background, ink `#2A2520`, brass-blue accent `#0E5484`, brass-gold accent `#8F7530`, brass-cream tint `#ece2cc`.
- **Type:** Playfair Display (or Georgia fallback) for headings; Inter for body.
- **Section headings (`<h4>`):** small caps, brass-blue, thin brass-cream rule below.
- **Pills:** brass-cream background, brass-grey text, small radius.
- **Borders:** thin brass-cream (`#d6cdb8`).

**No new design tokens.** If a colour or spacing isn't in `lib/site.css`, propose adding it there rather than inlining — keep the design system coherent.

## File layout

**New files:**
- `about/index.html` — the page itself.

**Modified files:**
- `lib/site.css` — append a `/about` section with the accordion + sticky-sidebar styles. Reuse existing tokens.
- `lib/site.js` — append accordion toggle logic (or inline a small `<script>` in `about/index.html` if simpler). Recommend `lib/site.js` for reuse + testability.
- All pages with the canonical site nav: add `<a href="/about">About</a>` between Overview and Offer.
  - Confirmed targets: `index.html`, `overview/index.html`, `offer/index.html`, `book/index.html`, `thanks.html`, `booking-failed.html`.
  - Verify at implementation time: check for the canonical `<nav class="site-nav-bar">` block and update everywhere it appears. `onepager/`, `build/`, `build-onepager/` use distinct nav patterns — leave alone.

**Tests:**
- Playwright test confirming `/about` renders, sidebar present, all 9 Experience rows render, accordion toggles, sticky sidebar works at desktop width.
- Snapshot or smoke test on mobile width confirming single-column stack.
- Add to existing test suite per repo convention (check `tests/` for pattern).

## Content writing rules (apply at implementation time)

The expanded prose for every row needs drafting. Rules:

1. **Source of truth:** `CVs/master-profile.yaml` first; supplement from wiki pages where master-profile is thin. If a claim has no source, drop it.
2. **Voice:** run the 7-check (per `.claude/rules/outbound-draft-voice-check.md`) on every paragraph before commit. Concrete > abstract; no AI register tells; Sam-signature moves where they land.
3. **Tense:** past-tense for past roles; present for current.
4. **First person:** allowed but used sparingly. Default is third-person CV register; first-person OK where it makes a sentence more concrete.
5. **No quoting Sam unless verbatim** (per `.claude/rules/verify-before-acting.md` § 5).
6. **No marketing-speak** — no "passionate about", "deep expertise in", "thrives in", etc.
7. **Numbers ground claims** — "8 paying clients", "11-agent SaaS", "70% membership growth", "4,788m peak". Use them where master-profile.yaml supports them; don't invent.

**Specific facts requiring verification before commit:**

- "8 paying clients" — check current count against Leads Sheet / `notes/projects/short-term-income/README.md`. The "8 business owners" framing in CLAUDE.md me.md was the Nov 2025 free Expert Pod; current paying count may be lower. Draft will likely need rewording to "several paying clients" or specifying the framing.
- Build dates — verify against `notes/concepts/<build>.md` for each.
- "Asked to write a scientific paper" (ESA) — source from `references/documents/esa-flex-project`.
- "Charity event organiser (A4D)" (Harrow Bangkok) — source from `references/documents/cv-teaching` or master-profile.

## Out of scope

- **Photo of Sam.** Not in v1. Can be added later as a sidebar element if Sam decides he wants one.
- **Reciprocal links from /overview.** The new top-nav item handles discoverability. A "More about Sam →" link from `/overview` is a future tweak, not a v1 requirement.
- **Anchor-link deep-linking** (e.g. `/about#experience-seaf` auto-opening the row). Defer to v2.
- **Print stylesheet.** The PDF CVs in `CVs/` cover that need.
- **Recognition rail beyond 3 items.** Languages, Speaking, Honours-beyond-the-3 all considered and cut at brainstorm time.
- **Wellington / Jan 2027 / specific client names.** Out per the positioning constraints.

## Open questions for the plan phase

1. **Accordion JS placement** — append to `lib/site.js` (reuse) or inline in `about/index.html` (isolation)? Defer to plan.
2. **Single-column vs 2-col Builds grid** — Build entries are short. Implementer can choose based on responsive read. Default to single-column accordion for consistency.
3. **Print stylesheet** — out of scope for v1 but worth a `@media print` block that suppresses the nav + footer if cheap.

## References

- Brainstorm session: 2026-05-31, this file's neighbour `2026-05-18-crads-ai-boutique-redesign-design.md` set the visual language.
- v3 mockup HTML preserved at `.superpowers/brainstorm/807-1780186029/content/about-v3.html`.
- Site styles: `lib/site.css`.
- Site interactions: `lib/site.js`.
- Existing nav reference: `index.html` lines 42–51.
- Voice rules: `.claude/rules/outbound-draft-voice-check.md`, `.claude/rules/voice-anti-patterns.md`.
- Honesty rules: `.claude/rules/check-before-edit.md`, auto-memory `feedback_stay_within_ability_level`.
- Master profile (content source): `CVs/master-profile.yaml`.
