# crads-ai.com — recursive UI audit + fix loop

**Run this prompt in a Claude Code session (Fable 5) at the repo root.** It renders the site, scores it against the rubric, fixes the highest-value problems, proves the fix landed, logs the round, and repeats until the score stops climbing. Wrap it in `/loop` or a cron to keep the site at Stripe-tier as copy and offers change.

> Written for Fable 5: outcome first, short instructions, hard "don't" rails, a verification gate baked in. Paste everything between the rulers as the session prompt.

---

**Goal:** raise `crads-ai.com`'s site score toward Stripe-tier and keep it there. One iteration = render → score → fix the weakest thing → prove it → log. Loop until it converges. Act once you've rendered and scored; don't plan first.

**Each iteration**

1. **Render.** `node scripts/audit-shots.mjs` → full-page desktop + mobile screenshots of all six marketing pages (home, about, how-it-works, offer, overview, group) in `scratchpad/shots/`. Open every screenshot.
2. **Score.** Grade each page against `docs/audit/RUBRIC.md` — six categories, to /100 per page and a site score. Read the last line of `docs/audit/ledger.jsonl`; that's the baseline you must beat.
3. **Target.** Take the lowest-scoring page-category cell, then any open **S1**, then **S2**. Fix highest-ROI first. One cell per iteration is fine — small steps that stick beat big steps that regress.
4. **Fix.** Edit the HTML / `lib/site.css` / presentational JS on the current branch. Match the existing tokens in `lib/site.css` — no new colours, fonts, or spacing values; reuse the components already defined.
5. **Prove it.** Re-run `scripts/audit-shots.mjs`, reopen the changed page's screenshot, re-score that cell. Keep the edit **only if the screenshot confirms it rendered and the score rose**. If it didn't, revert it. Report only what the screenshot backs.
6. **Log.** Append one line to `docs/audit/ledger.jsonl`:
   `{"iteration":N,"date":"YYYY-MM-DD","site":NN,"pages":{"home":NN,...},"consistency":NN,"open":{"S1":n,"S2":n,"S3":n},"fixed":["file:line — what"],"deferred":["needs-Sam — what"]}`
   Then overwrite `UI-AUDIT.md` with the human-readable report: scorecard, delta vs last round, what changed, what's parked for Sam.

**Stop when any one is true**
- site ≥ 92 **and** zero open S1/S2, or
- iteration == 6, or
- the site score rose < 2 points across two consecutive iterations (converged — hand back to Sam).

**Never** *(hard rails — these override "fix the weakest thing")*
- Never push to `main` or deploy. Work on a branch, commit once per iteration (`audit(ui): iteration N — <one line>`).
- Never touch `/api/**`, `/account/**`, or any `lib/*.js` that handles auth, booking, Stripe, KV, or email. Presentational HTML/CSS/JS only.
- Never delete or hide the **Group Block** SKU — it stays on-site by decision. If it reads stale, make it *honest* (waitlist / "by request", kill dead dates), don't remove it.
- Never invent a testimonial, metric, credential, date, or claim. Every claim traces to `CVs/master-profile.yaml` or Sam. If you can't verify it, cut it — don't fabricate.
- Never silently change a **price** to resolve an inconsistency. Pricing is Sam's call: report the mismatch, propose the fix, and park it under `deferred` — don't pick a number.
- Never let a fix in one place open a gap in another (change a price/name/badge → grep the other pages and reconcile in the same iteration, or park the whole thing).

**Voice** — Sam's, not AI-marketing. Before writing any user-facing copy, load `../../.claude/rules/voice-anti-patterns.md` (in the second-brain repo) if reachable, else apply from memory: no *delve / leverage / landscape / robust / crucial*; ≤2 em-dashes per paragraph; no "not X — it's Y" stacking; no rule-of-three adjective piles; concrete over abstract. Edit Sam's existing lines; don't regenerate from scratch.

**Report each run (terse)** — the ledger line, a six-row scorecard vs last round, the fixes (file:line, before→after), and the `deferred` list (pricing / strategy / new-asset calls that need Sam). No preamble.

---

## Why the loop is self-improving

`docs/audit/ledger.jsonl` is the memory. Every run reads the last line, so it always knows the current baseline and which cell is weakest — it hill-climbs instead of re-litigating the whole site each time. Because fixes are gated on a re-rendered screenshot, regressions get reverted inside the same iteration rather than shipping. Over successive runs (manual, `/loop`, or cron) the weakest cell keeps moving, the floor keeps rising, and the convergence rule hands control back to Sam the moment extra iterations stop paying — so it never grinds the site into over-polished sameness.

## What only Sam can decide (the loop parks these under `deferred`)
- **Pricing** numbers and which badge/order is canonical across the ladder.
- **Group Block strategy** — how live to keep a deprioritised SKU.
- **New assets** the loop can't fabricate — a real photo of Sam, a new testimonial, a screen recording of the EA.
- Anything that changes **what the site claims**, vs how clearly it says it.

## Running it
```bash
# one pass, interactive
claude   # paste the prompt above, at the repo root, on a feature branch

# keep it running until converged
/loop "run docs/audit/AUDIT-LOOP.md"

# scheduled (weekly, after copy/offer changes land)
# add to the cadence fleet as a job that runs the prompt on a fresh branch and opens a PR
```
