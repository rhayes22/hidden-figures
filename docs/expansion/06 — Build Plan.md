# 06 — Build Plan

Eight PRs, in dependency order, following the repo's existing branch-per-feature → PR → CI → merge workflow. Each has explicit acceptance criteria so progress is checkable without reading diffs.

**Suggested checkpoint: stop after PR 3** and look at the data before any UI work.

---

## PR 1 — Multi-Congress schema

**Branch:** `schema/multi-congress`

Add `jurisdictions`, `congresses`, `legislator_terms`, `member_congress_stats` per `04`. Convert `bills`, `roll_calls`, `legislators` to integer PKs with slugs preserved as unique columns. Convert `vote_positions` to integer FKs + `cast_code`.

Rename `makeRollCallId`/`makeBillId` → `makeRollCallSlug`/`makeBillSlug` in `lib/ids.ts`. New tables land alongside the old ones; nothing is dropped yet.

**Do first:** take a Neon branch. Free, instant, makes this reversible.

✅ **Done when**
- `npm run db:generate` produces a clean migration; `db:migrate` applies it
- Backfill preserves counts **exactly**: 330,867 positions · 1,414 roll calls · 441 bills · 530 legislators
- `vote_positions` bytes/row drops from 179 to ≈90 (verify with `pg_total_relation_size`)
- Existing Vitest suite passes; `lib/ids.test.ts` updated for the rename

---

## PR 2 — Historical roster ingest

**Branch:** `ingest/historical-members`

New `scripts/sync-legislators.ts` consuming **both** `legislators-current.json` and `legislators-historical.json`. Writes one `legislators` row per person and one `legislator_terms` row per person-per-Congress-per-chamber.

Seeds `congresses` for 117–119 and `jurisdictions` with `us-congress`.

✅ **Done when**
- Every member of the 117th, 118th, 119th resolves with correct party/state/district **for that Congress**
- The **~3,300 currently-skipped vote positions** are recoverable — departed members now exist
- Party switchers and chamber movers spot-checked by hand (pick 3)
- Idempotent: running twice changes nothing

---

## PR 3 — Voteview backfill

**Branch:** `ingest/voteview-backfill`

New `scripts/sync-voteview.ts`. Downloads per-Congress files for a given Congress, builds the *(congress, chamber, icpsr) → bioguide* crosswalk from the members file, bulk-loads via `COPY`.

```bash
npm run sync:voteview -- 117
npm run sync:voteview -- 118
```

Prefer Voteview over per-vote XML for backfill — three downloads instead of thousands of rate-limited requests. Existing `sync-votes.ts` stays as the nightly incremental for the current Congress.

Also populate `member_congress_stats` here, before any slow query ships.

✅ **Done when**
- 117th: **1,945** roll calls loaded · 118th: **1,926**
- Total positions land near **1.46 M** (±3%)
- Unmatched ICPSR ids reported loudly, not silently dropped
- Re-running is idempotent
- Spot-check 5 roll calls against clerk.house.gov / senate.gov and confirm tallies match

> 🔎 **Checkpoint — stop here.** Look at the data before building UI on top of it.

---

## PR 4 — Bill metadata for historical Congresses

**Branch:** `ingest/historical-bills`

Fetch titles/summaries for bills referenced by newly loaded roll calls. Congress.gov at the **measured 20,000 req/hr** limit (not the 5,000 in the current brief) is sufficient. Use GovInfo BILLSTATUS bulk if per-bill calls prove slow.

✅ **Done when**
- Every `roll_calls.bill_id` in 117–119 resolves to a bill with a real title
- Roll calls with no bill (procedural, nominations) still render correctly
- No unattributed "Unknown bill" rows

---

## PR 5 — Congress-aware data layer

**Branch:** `feat/congress-queries`

Thread a Congress parameter through `lib/members.ts`, `lib/votes.ts`, `lib/legislation.ts`, `lib/bill-search.ts`. Add `lib/congresses.ts` for the dimension. Party/state/chamber now read from `legislator_terms`; stats read from `member_congress_stats`.

No UI changes — pure data layer, so it can be reviewed on tests alone.

✅ **Done when**
- Every query takes an explicit Congress; current-Congress default is one constant in `lib/site.ts`
- Unit tests cover a party switcher and a chamber mover
- Existing pages render identically to today

---

## PR 6 — Congress routes and switcher

**Branch:** `feat/congress-routes`

`/congress`, `/congress/[number]`, `/congress/[number]/members`, `/congress/[number]/bills`, `/members/[bioguide]/congress/[number]`. Shared `<CongressSwitcher>`. `/congress/119/*` 301s to canonical.

✅ **Done when**
- All existing URLs still resolve — verified against the current sitemap
- Switcher only offers Congresses with data
- Switching preserves context (same member, different Congress)
- Sitemap includes historical routes; `/congress/119/*` excluded as duplicate

---

## PR 7 — Time-aware member profile

**Branch:** `feat/member-timeline`

"Served in" strip, per-Congress stats, party/state/district as-of the viewed Congress, career totals shown separately and labelled.

✅ **Done when**
- A party switcher shows the correct party per Congress
- A chamber mover shows House votes under House, Senate under Senate
- Career totals visibly distinguished from per-Congress figures

---

## PR 8 — Coverage disclosure + re-enable the cron

**Branch:** `feat/coverage-and-cron`

Coverage section in `/about` and on `/congress` (the statement drafted in `05`). Voteview citation. Re-enable the nightly schedule in `.github/workflows/sync.yml` — **two commented lines**, paused since June during UI iteration.

Update `docs/PROJECT.md`: new scope, corrected rate limit, new sources, new schema.

✅ **Done when**
- Coverage stated plainly on both pages
- Cron runs green on schedule and the 119th picks up recent votes
- `PROJECT.md` matches reality

---

## Deliberately deferred

| Item | Why |
| --- | --- |
| **State legislatures** | Measure first (`02`). Seam is built in PR 1; nothing else until the coverage map exists. |
| **Pre-117th Congresses** | Architecture supports it. Re-run PR 3's script per Congress once the UI is proven. |
| **Full bill catalog** | GovInfo BILLSTATUS. Independent of this work. |
| **Flat-rate hosting move** | Not needed — launch scope fits the free tier. Revisit when traffic demands always-on compute. |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Backfill corrupts existing 119th data | Neon branch before PR 1; exact count assertions |
| ICPSR→bioguide crosswalk gaps for older members | Report unmatched loudly; `legislators-historical` should cover 117+ fully |
| Voteview and Clerk disagree on a tally | Spot-check in PR 3; prefer official XML for 118–119, Voteview for older |
| Congress-scoping misses a query path | PR 5 is data-layer-only so tests can prove it before UI lands |
| Scope creep into states | It's a separate tier with its own gate. Don't start it here. |
