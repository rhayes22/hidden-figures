# Hidden Figures — Expansion Plan

**Status:** Draft for review · **Prepared:** 5 September 2026 · **Owner:** Ryan Hayes
**Repo:** https://github.com/rhayes22/hidden-figures · **Live brief:** `docs/PROJECT.md`

This is the plan for taking Hidden Figures from "the current Congress" to "a real, deployable, multi-Congress voting record site," with the state-legislature tier scoped but deliberately deferred.

Everything here is either **measured** (I queried the live database or the source files directly), **derived** (computed from measured file sizes), or **estimated** (modeled, with error bars stated). Every claim is labelled.

---

## The three decisions this plan asks you to make

| # | Decision | Recommendation | Where it's argued |
| --- | --- | --- | --- |
| 1 | How far back do we go? | **117th–119th (2021–2026)** at launch, architected for more | `03 — Scope & Sizing` |
| 2 | Do we restructure the schema first? | **Yes — and it is the gate on everything else** | `04 — Schema Changes` |
| 3 | Federal and state together, or apart? | **Apart. Federal ships. State stays a designed seam.** | `02 — Data Sources (State)` |

---

## The headline findings

**Storage is not a constraint at any scope we care about.** The last three Congresses come to roughly **129 MB** — that fits inside Neon's 500 MB free tier with room to spare. Even all 237 years of congressional history is only ~2.15 GB (~$1.18/month). The budget for this project is engineering time and data quality, not hosting.

**The Congress.gov API you already have a key for cannot do history.** I tested it: `house-vote` returns data for the 118th and 119th and empty arrays for everything older. The historical path is Voteview plus the chamber XML archives. This is the single most important correction to the current plan.

**The current schema will not survive multiple Congresses** — and not because of size. `legislators` stores one party, one state, one district per member. Across Congresses those change. That's a correctness problem, not an optimization, and it has to be fixed before any backfill.

**Bill metadata has a hard floor at 1973** that vote data does not. Votes go back to 1789; rich bill titles and summaries start at the 93rd Congress. That asymmetry should shape how far back the product claims to go.

---

## Contents

1. **`01 — Data Sources (Federal)`** — every verified endpoint, with coverage, auth, rate limits, and test results
2. **`02 — Data Sources (State)`** — the OpenStates path, and the coverage problem that makes states hard
3. **`03 — Scope & Sizing`** — how far back to go, what each range costs
4. **`04 — Schema Changes`** — the multi-Congress data model
5. **`05 — Product & Information Architecture`** — routes, the Congress switcher, what the landing page becomes
6. **`06 — Build Plan`** — the PR-by-PR sequence for the next working session
7. **`07 — Open Questions & Risks`** — what I could not settle, and what it would cost to settle it

---

## How to use this next session

Read `06 — Build Plan`, adjust the sequence or scope, then the prompt is roughly:

> Read the expansion plan in docs/expansion/. Start at PR 1 and work through the sequence, branch-per-feature with PRs as usual. Stop after PR 3 so I can look at the data before we do the UI.

Every PR in that sequence has explicit acceptance criteria so progress is checkable without reading the diff.
