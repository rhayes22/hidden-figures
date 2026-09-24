# 02 — Data Sources (State)

**Recommendation: do not build this yet. Design the seam, ship federal, then measure states before committing.**

The reason is not cost — states add maybe $0.06/month of storage. The reason is that state vote data is *qualitatively* different from federal data, and a "how your rep voted" page that renders empty is worse than one that doesn't exist.

---

## The one thing to understand about state data

Federal data is uniform, official, complete, and machine-readable. State data is none of those things.

**Many state legislatures pass most business by voice vote.** A voice vote leaves no per-member record — not one that's hard to get, one that *does not exist*. No amount of engineering or hosting spend produces it.

On top of that, publication quality varies enormously. From Open States' own [Legislative Data Report Card](https://open.pluralpolicy.com/reportcard/):

| Grade | States |
| --- | --- |
| **F** | Alabama, Kentucky, Massachusetts, Nebraska |
| **D** | California, Indiana, Louisiana, Maine, Oklahoma, Rhode Island, Wisconsin |

Points are deducted specifically for missing roll call votes. **Texas is flagged as not providing stand-alone roll calls at all** — the second-largest legislature in the country.

> This is a product problem before it is a data problem. It means the state tier can never be "all 50 states" as a single launch. It has to be per-state, with honest coverage disclosure.

---

## The source: Open States / Plural

The Open States project (under Plural since 2023) aggregates all 50 states, DC, Puerto Rico, and Congress into one standardized schema.

### Option A — Bulk Postgres dump *(recommended for the measurement pass)*

```
https://data.openstates.org/postgres/monthly/YYYY-MM-public.pgdump
```

Verified sizes (no authentication required):

| Month | Size |
| --- | --- |
| 2026-08 | **10,727,057,157 B** (10.7 GB) |
| 2026-07 | 10,711,908,617 B |
| 2026-06 | 10,628,677,651 B |

Growth ≈ **50 MB/month compressed**. This is the *entire* public database — bills, actions, versions, sponsorships, sources, search vectors — of which per-member votes are a small part.

### Option B — Per-session CSVs

Per-state, per-session zips containing `bills.csv`, `votes.csv`, `vote_counts.csv`, **`vote_people.csv`** (the per-legislator positions), `bill_actions.csv`, `bill_sponsorships.csv`, and others.

Browse at `https://open.pluralpolicy.com/data/session-csv/`. **Requires a free login** — download links are gated. Coverage spans the 1980s (North Carolina from 1985, California from 1989) through 2026, though vote coverage is much shallower than bill coverage.

### Option C — API v3

`https://v3.openstates.org/` — API key via `open.pluralpolicy.com`. Fine for lookups, wrong tool for bulk ingest.

---

## Sizing — **estimated**, and the weakest number in this whole plan

No authoritative count exists, so this is modeled:

| Input | Value | Basis |
| --- | --- | --- |
| State legislators | ~7,400 | vs. 535 federal |
| Bills per biennium (all states + Congress) | ~208,000 | LegiScan's published figure |
| Roll calls per biennium | ~171,000 | bills × share reaching a recorded floor vote × votes per bill |
| Avg positions per roll call | ~75 | avg state house 110, avg state senate 39 |
| Positions per biennium | ~12.8 M | vs. ~0.55 M federal |
| Usable coverage depth | ~5.5 cycles | Open States, roughly 2015 → present |
| **Total** | **~65,000,000** | range **50–80 M** |

At the optimized schema that's ~6.3 GB — about **$0.06/month** on a Supabase Pro plan, or $3.46 on Neon storage.

> **Confidence: low, ±25%.** Every other number in this plan is measured or derived. This one is a model.

### How to turn the estimate into a fact — one afternoon, $0

1. Download the 10.7 GB dump
2. `pg_restore` into a local Postgres
3. Run four `count(*)` queries against the vote tables
4. **Group vote counts by jurisdiction** — this is the genuinely valuable output

Step 4 matters more than the row count. It produces the **per-state coverage map**: which legislatures actually publish individual votes, how deep the history goes for each, and therefore which states are launchable. That map is the input to any real state roadmap.

---

## What to build *now* (and it's small)

Don't build the state tier. Build the seam so adding it later isn't a rewrite:

- A **`jurisdictions`** table, seeded with a single row: `us-congress`
- A `jurisdiction_id` foreign key on `legislators`, `roll_calls`, and `bills`, defaulting to that row
- Route structure that can carry a jurisdiction segment later without breaking existing URLs

That's one migration and a few columns. It costs almost nothing now and saves a painful retrofit later. Details in `04 — Schema Changes`.

## What the state roadmap looks like when we get there

1. Run the measurement pass above → per-state coverage map
2. Pick the **10–15 states with genuinely complete roll call data** and ship those
3. Per-state coverage badges from day one, plus an explicit *"this legislature does not publish individual vote records"* state
4. Expand as coverage allows — never alphabetically, always by data quality

Each state is independently useful. There is no reason to wait for Texas.
