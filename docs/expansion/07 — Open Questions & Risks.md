# 07 — Open Questions & Risks

## Questions for you, before the next session

### 1. Launch scope — three Congresses or five?

Both fit the free tier. Three (117–119, 2021–26) is ~129 MB and a clean "last three Congresses" claim. Five (115–119, 2017–26) is ~218 MB and gives a full decade.

**My recommendation: three.** More headroom, and the marginal research value of 2017–2020 is lower than the cost of a longer first backfill. Easy to extend later — it's re-running one script.

### 2. Should Voteview be the source of record for 117–118, or only for pre-118?

Congress.gov and the chamber XML cover 118–119 officially. Voteview covers everything but is a research dataset.

**My recommendation:** official XML for 118–119, Voteview for 117 and earlier, with a `source` column on `roll_calls` so it's always visible which is which. Slightly more work, but it means the recent data users care most about comes from the primary record.

### 3. How much does "career totals" matter on member profiles?

Per-Congress stats are straightforward. Career totals across a 30-year career are only meaningful once we've loaded 30 years — with three Congresses, "career" is misleading for anyone who served before 2021.

**My recommendation:** show per-Congress stats only at launch. Add career totals when the archive is deep enough to justify them.

### 4. Do you want the docs in the repo as well as Notion?

`docs/PROJECT.md` is currently the single source of truth. This plan could live at `docs/expansion/` so it's versioned with the code, or stay in Notion only.

**My recommendation:** both — Notion for review and comments, repo for the working reference the next session reads.

---

## What I could not settle

### The state-tier row count *(±25%)*

Every other number in this plan is measured or derived from measured file sizes. **~65 M state vote positions is a model**, built from LegiScan's ~208,000 bills per biennium, average chamber sizes, and cross-checked against the 10.7 GB OpenStates dump for plausibility.

**Cost to settle: one afternoon, $0.** Restore the dump locally, run `count(*)` grouped by jurisdiction. The row count is the lesser prize — the real output is the per-state coverage map.

### Which states actually publish per-member votes

I know from Open States' report card that Alabama, Kentucky, Massachusetts and Nebraska fail, that eleven states get D grades with roll-call deductions, and that Texas provides no stand-alone roll calls. **I do not have a definitive per-state list**, and it isn't published anywhere I could find — it has to be derived from the data.

Same measurement pass produces it.

### Exact roll-call counts before the 117th

Counts for 117–119 are exact (I counted them). Wider ranges are derived from file sizes at 27.9 bytes/line — accurate to within a few percent, verified against an independent chamber-size calculation, but not exact. Good enough for sizing; don't quote them as facts.

### Voteview vs. official tallies

I did not diff Voteview against the Clerk XML for any specific vote. Voteview is well-regarded and widely used in political science, but PR 3 includes a spot-check for exactly this reason. If they disagree, prefer the official record.

---

## Risks, ranked

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Backfill corrupts the working 119th data** | High | Neon branch before PR 1. Exact count assertions in acceptance criteria. Free and instant. |
| **Schema migration missed a query path** | Medium | PR 5 is data-layer-only, so tests prove it before any UI depends on it |
| **ICPSR→bioguide gaps** | Medium | Report unmatched loudly. `legislators-historical` should cover 117+ completely; older Congresses are where this bites |
| **Historical UI renders members misleadingly** | Medium | The entire point of `legislator_terms`. Spot-check a party switcher and a chamber mover by hand |
| **Scope creep into state legislatures** | Medium | Separate tier, own gate. Seam only in PR 1. |
| **senate.gov 403s during backfill** | Low | Voteview avoids this entirely for bulk. Existing sync already batches with pauses. |
| **Cost surprise** | Low | Launch scope fits the free tier. Storage was never the constraint. |

---

## Things that are *not* risks, and shouldn't be planned around

- **Storage cost.** 129 MB. Free tier. Even all 237 years is ~$1.18/month.
- **Licensing.** Every source is public domain or freely redistributable. Voteview just needs a citation.
- **Congress.gov rate limits.** 20,000/hr measured — 4× what the brief says. Not a bottleneck.
- **Data freshness.** The nightly cron already works; it's paused, not broken. Two commented lines.
