# crads-ai.com — UI audit rubric (v1)

The scoring standard for the recursive UI audit loop (`docs/audit/AUDIT-LOOP.md`). Six categories, weighted to **/100**. Score each **page** against it, then roll up to a **site** score. Designed so two different auditors land within ~5 points of each other — the sub-checks are the objective anchor, not vibes.

## The baseline (the 10/10 anchor)

**Stripe.com is the reference "really good website."** It is the canonical example of the exact problem this site has: explain a technical product to a mixed technical / non-technical buyer, stay ruthlessly clear, convert, and hold one design system across dozens of pages. Every category's `10` band = "as good as Stripe does this." **Linear.app** is the secondary anchor for minimalist consistency and motion restraint.

Score relative to that ceiling. A 10 is rare and means "I could not improve this." Most strong sections land 7–9.

## The six categories

| # | Category | Weight | What it measures |
|---|---|---|---|
| 1 | First impression & visual craft | 20 | Does it look considered and load a clear value in the first screen? |
| 2 | Message clarity (problem → solution → value) | 20 | Is the argument stated, in the reader's language, and does it land? |
| 3 | Information consistency | 15 | Do prices, claims, names and dates agree everywhere and stay true? |
| 4 | Conciseness & scannability | 15 | Does every page earn its length and read fast? |
| 5 | Diagrams, images & visual proof | 15 | Do the visuals carry meaning, cohere, and prove the claims? |
| 6 | Conversion & UX mechanics | 15 | Does the next step work — links, forms, mobile, a11y, SEO? |

Each category is scored **/10**, then multiplied by its weight/10 to sum to 100.

---

### 1 · First impression & visual craft — /20

Objective sub-checks (each a point of evidence):
- **5-second test** — from the first viewport alone (hero headline + subhead + one CTA), can a stranger say *what this is*, *who it's for*, and *why care*? If no → cap at 5.
- **Type system** — ≤2 families, a consistent modular scale, correct hierarchy (one visual h1).
- **Colour** — one coherent palette; **all text meets WCAG AA** (≥4.5:1 body, ≥3:1 for ≥24px).
- **Spacing & rhythm** — consistent vertical rhythm, aligned to a grid, generous whitespace.
- **Zero visual bugs** — no overflow, stray glyphs, broken images, mid-animation freeze, or layout shift.

Bands: **18–20** every check passes at Stripe level · **14–17** one polish gap · **10–13** one system inconsistent or the 5-sec test wobbles · **<10** a visible bug or an unclear hero.

### 2 · Message clarity: problem → solution → value — /20

- **Problem named early** — by the end of the first section, in the reader's words (not the product's).
- **Solution mechanism** — explains *how* it works, not only *what* it is.
- **Value is concrete** — a specific outcome, quantified where honest ("10 hours a week", "four sessions and you own it").
- **Right altitude of jargon** — no unexplained `MCP` / `RAG` / `agent swarm` on a conversion page; deeper pages may go deeper.
- **One idea per section** — a followable throughline; each section advances the argument.

Bands: **18–20** all five, effortless to follow · **14–17** one link weak (usually value not concrete) · **10–13** mechanism or problem missing · **<10** reader can't tell what they'd get.

### 3 · Information consistency — /15 *(scored once at site level)*

- **Pricing identical** everywhere a SKU appears (amount, currency prefix, cadence, badges, order).
- **Claims identical & true** — build count, credentials, session counts trace to `CVs/master-profile.yaml` / Sam.
- **No stale dates** — nothing past-dated as upcoming; no event still described as "upcoming" once its date has passed.
- **Names/labels stable** — the 4 Cs, Pack names, SKU names spelled and ordered the same site-wide.
- **Strategy-aligned** — the site sells the *current* offer, not a shelved one, and doesn't oversell a deprioritised lever.

Bands: **14–15** everything agrees · **10–13** cosmetic drift (currency prefix, badge text) · **6–9** a real contradiction (price or maths) or a stale date · **<6** the site sells something that no longer exists as described.

### 4 · Conciseness & scannability — /15

- **Earns its length** — no section restates another *page* (IA is roughly MECE); no paragraph restates the one above.
- **Scannable** — headings/subheads carry the meaning if read alone; short paragraphs; lists where apt.
- **Reading level** — ~grade 8–10 on conversion pages (Flesch reading-ease ≥ 55).
- **Signal density** — cut any sentence that doesn't add a fact, a feeling, or forward motion.

Bands: **14–15** tight throughout · **10–13** one baggy section or mild cross-page overlap · **6–9** a whole section duplicates another page · **<6** the reader has to wade.

### 5 · Diagrams, images & visual proof — /15

- **Purpose** — every diagram makes one point a reader gets in <10s; captioned or self-evident.
- **Cohering grammar** — diagrams share a visual language (same node/line/colour vocabulary).
- **Mobile-legible** — no diagram shrinks to unreadable or overflows at 390px.
- **Accessible SVG** — inline SVG carries `role="img"` + `aria-label`, or `aria-hidden` if purely decorative.
- **Proof is specific** — named testimonials with role (photo/logo/link ideal), not anonymous praise.

Bands: **14–15** every visual pulls weight and coheres · **10–13** one weak/decorative-only visual or a caption gap · **6–9** a mobile-illegible diagram or thin proof · **<6** decoration masquerading as explanation.

### 6 · Conversion & UX mechanics — /15

- **One primary CTA** per page, repeated; the next step is unmistakable.
- **Links & routes resolve** — every internal href and every CTA hits the right, existing route.
- **Interactions work** — toggles, accordions, forms post to a real endpoint (verified, not assumed).
- **Mobile** — no horizontal scroll; tap targets ≥44px.
- **A11y baseline** — single h1, logical heading order, keyboard-operable, `prefers-reduced-motion` respected.
- **Hygiene** — title/description/canonical/OG present; images sized; no console errors.

Bands: **14–15** flawless path + clean a11y/SEO · **10–13** one broken link or a weak outline (card titles as `<p>`) · **6–9** a dead CTA / form-to-nowhere / mobile break · **<6** the visitor can't act.

---

## Rolling up to a site score

1. Score categories **1, 2, 4, 5, 6** per page (they're page-local).
2. Score category **3** once, across the whole site.
3. **Page score** = weighted sum of its five local categories, rescaled to /100.
4. **Site score** = mean(page scores) × 0.85 + consistency(cat 3, /100) × 0.15.

Report both. The loop optimises the **site score** but always fixes the lowest-scoring *page-category* cell first.

## Grade bands (site score)

- **90–100** — Stripe-tier. Ship and be proud.
- **80–89** — Strong. A few high-ROI fixes from excellent.
- **70–79** — Good with clear gaps. A visitor converts despite friction.
- **<70** — Real work needed; something is unclear, broken, or untrue.

## Severity tags for findings

- **S1** — false, broken, or actively costing conversions (stale date, dead CTA, contradiction at the price point, unclear hero).
- **S2** — real drag (cross-page inconsistency, redundant section, weak proof, outline/SEO gap).
- **S3** — polish (copy tightening, caption, micro-inconsistency).

Fix S1 → S2 → S3, and within a tier, cheapest-first.
