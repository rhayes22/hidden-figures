# Slice 3 — Self-verifying ingest

Epic: "Make the current Congress genuinely useful" (`.claude/current-work.md`, Phase A)
Written: 2026-09-24 · Status: **draft** — two open questions (Q1, Q2), neither blocking;
the acceptance criteria below assume the recommended answers.

Every number in this spec was measured against the live production database and against
`clerk.house.gov` / `senate.gov` on **2026-09-24**, by fetching the published tally for
**all 1,573 roll calls** in the database (676 House, 897 Senate; zero fetch failures at
`BATCH = 5` / `PAUSE_MS = 400`). They supersede the "~3,300 dropped positions" figure in
the epic, which predates slice 1's re-sync.

### Title

Verify stored positions against each chamber's published tally

### Problem

Both chambers publish their own official tally next to the per-member positions, and
`scripts/sync-votes.ts` discards it.

- Senate XML: `<count><yeas>51</yeas><nays>47</nays><present/><absent>2</absent></count>`
- House XML: `<vote-totals>` with per-party rows and a `<totals-by-vote>` row
  (`yea-total`, `nay-total`, `present-total`, `not-voting-total`)

Because nothing compares the two, the sync currently drops **4,902 vote positions
(1.28% of the 381,936 the chambers published) in complete silence**. The only trace is a
`No bioguide for LIS …` warning per Senate position, scrolled past in a log nobody reads,
and a single aggregate `(N for untracked members skipped)` line at the end of the run.

Measured, whole corpus:

| | roll calls | publish a yea/nay tally | positions published | positions stored | dropped | rate |
|---|---|---|---|---|---|---|
| House | 676 | 675 | 291,814 | 287,721 | **4,093** | 1.40% |
| Senate | 897 | 897 | 89,688 | 88,891 | **797** | 0.89% |
| `house-119-1-2` (candidate tally) | 1 | — | 434 | 422 | **12** | 2.76% |
| **Total** | **1,573** | **1,572** | **381,936** | **377,034** | **4,902** | **1.28%** |

Per-roll-call shortfall, every roll call in the database:

- **Senate** — 0 on 109 roll calls, **1 on 780**, 2 on 7, 3 on 1. Max **3**.
- **House** — 0 on 75, then 1 (50), 2 (23), 3 (24), 4 (104), 6 (62), 7 (88), 8 (66),
  9 (62), 10 (18), 11 (40), 12 (21), 13 (29), 14 (9), 15 (4). Max **15**.

Who is being dropped (sampled across 58 roll calls spanning Jan 2025 – Sep 2026):

- **Senate** — members whose record has left `legislators-current.yaml`, so the LIS→bioguide
  crosswalk has no entry at all: `S293` Graham (R-SC) on every roll call sampled, `S419`
  Mullin (R-OK) on 15 of 18, plus `S350` Rubio and `S421` Vance on the January 2025 votes
  they were still present for.
- **House** — the 6 non-voting delegates the roster deliberately excludes (Norton,
  Plaskett, Radewagen, Moylan, King-Hinds, Hernández — every one of them appears in the
  House XML and counts toward the published totals), plus members who left mid-Congress
  (Gaetz, Waltz, Green (TN), Connolly, Grijalva, Turner (TX), Sherrill, Greene (GA),
  LaMalfa, Swalwell, Cherfilus-McCormick, Gonzales (TX), Scott (GA) …).

The table `legislators` today holds **530 rows, all `in_office = true`** — not one departed
member. `scripts/sync-members.ts` never inserted them, so `sync-votes.ts` filters their
positions out and says nothing that a reader would recognise as data loss.

**The check is cheap and the data is already downloaded.** No new endpoint, no new request.

**And it is the precondition for slice 4.** The cron stays paused until the sync can tell
the difference between a clean run and a broken one on its own.

### The central design decision

A strict "stored positions must equal the published tally" assertion would fail on
**1,388 of 1,573 roll calls** today. It would be correct and useless.

The measurement above resolves the tension, because it separates two different claims that
were being conflated:

**1. The chamber's tally always matches the positions in its own document.** Measured on
every roll call that publishes a yea/nay tally: **1,572 of 1,572, bucket for bucket** —
yeas, nays, present and absent each exactly equal the count of `<vote_cast>` / `<vote>`
values the parser produces. Zero exceptions, both chambers, both sessions. So **published
tally vs. _parsed_ positions is an exact, zero-tolerance assertion that passes universally
today** — and it is the assertion that catches a broken parser, a truncated download, or a
source format change.

**2. Positions are then lost between parsing and storage** — at the LIS crosswalk and at
the `legislators` membership filter. That loss is real, known, and slice 14's to fix. It is
made impossible to ignore not by tolerating a fuzzy number, but by **requiring every single
lost position to be attributed to a named member id and a named reason**. Known
discrepancy: `parsed − stored == skipped`, every skip carrying a member id. New
discrepancy: a non-zero residual — a position that vanished with nobody's name on it.
**That residual is zero today and is a fatal error at any value above zero, forever, with
no tuning.**

A secondary per-roll-call ceiling on the attributed skips guards the case where the
attribution machinery is itself intact but the crosswalk collapses (every Senate position
skipped, each dutifully attributed). Measured maxima are 3 (Senate) and 15 (House); the
budgets are set at 5 and 20.

### Acceptance criteria

**A. Parse the published tally — `lib/votes.ts`**

- [ ] `lib/votes.ts` exports:

      ```ts
      export type PublishedTally =
        | { kind: "buckets"; yea: number; nay: number; present: number; notVoting: number }
        | { kind: "total"; total: number }
        | { kind: "none" }
        | { kind: "malformed"; reason: string };
      ```

- [ ] `ParsedRollCall` gains exactly one new field, `tally: PublishedTally`. It is never
      `null` or `undefined` — absence is `{ kind: "none" }`. No existing field of
      `ParsedRollCall` changes type or meaning.
- [ ] Tally parsing **never throws**. A document the parser cannot make sense of yields
      `{ kind: "malformed", reason }`, so the run can quarantine one roll call instead of
      dying on it.
- [ ] **Senate (`parseSenateVote`)** reads `roll_call_vote.count`:
      - Each of `yeas`, `nays`, `present`, `absent` is read with the rule: **missing or
        empty element → `0`** (`<present/>` is the common case — it parses to `""`, and
        `Number("") === 0` must be reached deliberately, not by accident); a present but
        non-numeric value → `{ kind: "malformed" }`.
      - All four missing or empty → `{ kind: "none" }`, **not** four zeros. (A thin tally
        must not be read as "the chamber says nobody voted".)
      - Otherwise `{ kind: "buckets", … }`, with `absent` mapping to `notVoting`.
- [ ] **House (`parseHouseVote`)** reads `vote-metadata.vote-totals`:
      - `<totals-by-vote>` present → `{ kind: "buckets", … }` from `yea-total`,
        `nay-total`, `present-total`, `not-voting-total`, same missing/empty → `0` rule.
      - `<totals-by-vote>` absent but one or more `<totals-by-candidate>` rows present →
        `{ kind: "total", total: <sum of candidate-total> }`. This is the Speaker election
        (`house-119-1-2`, the only such row today: Johnson 218 + Jeffries 215 + Emmer 1 +
        Present 0 + Not Voting 0 = 434). The House published a candidate tally, not a
        yea/nay tally; the member count is still verifiable and must be verified.
      - `<vote-totals>` absent entirely → `{ kind: "none" }`.
      - **Internal consistency:** when `<totals-by-party>` rows exist, their four columns
        must sum to the `<totals-by-vote>` row. They do on all 675 House roll calls that
        have one. A disagreement → `{ kind: "malformed", reason }`.
- [ ] `normalizePosition` is **not changed**. Its current behaviour — including mapping the
      Speaker-election candidate names to `not_voting` — is load-bearing for 377,034 stored
      rows. See carried finding 1.
- [ ] `parseSenateVoteMenu`, `billIdFor`, `normalizeText`, `parseVoteDate`,
      `congressForYear`, `sessionForYear` are untouched.

**B. Verification is a pure function — new `lib/tally.ts`**

- [ ] A new module `lib/tally.ts` owns the arithmetic. It imports types from `lib/votes.ts`
      and `lib/ids.ts` and nothing else — no database, no network, no `scripts/` import.
      It is placed in `lib/` precisely because that is the only unit-tested layer
      (`CLAUDE.md`, "Conventions").
- [ ] It exports:

      ```ts
      export type TallyVerdict =
        | { ok: true;  kind: "verified";        published: number; counted: number }
        | { ok: true;  kind: "total-only";      published: number; counted: number }
        | { ok: true;  kind: "no-tally" }
        | { ok: false; kind: "bucket-mismatch"; message: string;
            diffs: Array<{ bucket: ParsedPosition; published: number; counted: number }> }
        | { ok: false; kind: "total-mismatch";  message: string; published: number; counted: number }
        | { ok: false; kind: "malformed-tally"; message: string };

      export function verifyTally(
        tally: PublishedTally,
        positions: ReadonlyArray<{ position: ParsedPosition }>,
      ): TallyVerdict;
      ```

- [ ] `verifyTally` semantics, exactly:
      - `kind: "buckets"` → compare **all four buckets independently**. Every bucket equal
        → `verified`. Any bucket unequal → `bucket-mismatch`, `diffs` listing **only** the
        buckets that differ. A total that happens to match while two buckets are swapped is
        a failure, not a pass.
      - `kind: "total"` → compare `total` against `positions.length` only → `total-only`
        or `total-mismatch`.
      - `kind: "none"` → `no-tally`.
      - `kind: "malformed"` → `malformed-tally`, carrying the parser's reason.
- [ ] It also exports the coverage check and its budgets:

      ```ts
      export type SkipReason = "no-crosswalk" | "not-in-roster";

      export const COVERAGE_BUDGET: Record<Chamber, number> = { house: 20, senate: 5 };

      export function verifyCoverage(input: {
        parsedCount: number;
        storedCount: number;
        skipped: ReadonlyArray<{ memberId: string; reason: SkipReason }>;
        budget: number;
      }): CoverageVerdict;
      ```

- [ ] `verifyCoverage` computes `residual = parsedCount − storedCount − skipped.length`
      and returns:
      - `residual !== 0` → `{ ok: false, reason: "unattributed", … }`. **This is the
        regression detector and it has no tolerance and no tuning knob.** A negative
        residual (more stored than parsed) is equally a failure.
      - `residual === 0` and `skipped.length > budget` →
        `{ ok: false, reason: "over-budget", … }`.
      - otherwise `{ ok: true, … }`, carrying `skipped.length` and a per-reason breakdown.
- [ ] `COVERAGE_BUDGET` carries a comment recording the measured maxima and the date:
      House 15, Senate 3, measured 2026-09-24 over all 1,573 roll calls; the budgets sit
      one departure-wave above them.
- [ ] `lib/tally.ts` contains no `console.*` call and no `process.exit`. It returns
      verdicts; the script decides what to do with them.

**C. Assertions in the sync — `scripts/sync-votes.ts`**

- [ ] **Tally verification runs on the _parsed_ positions, before the crosswalk and before
      any database write.** For a Senate vote that means the LIS-keyed positions exactly as
      `parseSenateVote` produced them. This is the reason the assertion can be exact; a
      developer must not move it after the crosswalk or after the `legislators` filter.
- [ ] A roll call whose verdict is `bucket-mismatch`, `total-mismatch` or `malformed-tally`
      is **quarantined**: it is excluded from the `bills`, `rollCalls` and `votePositions`
      inserts entirely. A quarantined roll call that already exists in the database is left
      exactly as it is — this slice never deletes or rewrites a row. Zero roll calls
      quarantine today.
- [ ] A roll call whose verdict is `no-tally` or `total-only` is written normally.
- [ ] The sync tracks, per roll call, every position it does not store, as
      `{ memberId, reason }`:
      - `"no-crosswalk"` — a Senate LIS id with no entry in the LIS→bioguide map (this is
        the existing `No bioguide for LIS …` branch).
      - `"not-in-roster"` — a bioguide id absent from the `legislators` table (this is the
        existing `known.has(p.memberId)` filter).
      No other reason exists; if a position is dropped for any other cause it shows up as
      residual, which is the point.
- [ ] `verifyCoverage` runs per roll call against the rows the sync is about to write, with
      `budget = COVERAGE_BUDGET[vote.chamber]`.
- [ ] **Post-write reconciliation.** After the `votePositions` chunked upsert loop, one
      single query reads back `SELECT roll_call_id, count(*) FROM vote_positions WHERE
      roll_call_id = ANY($1) GROUP BY roll_call_id` for the roll calls this run touched,
      and asserts each count equals the number of rows the run intended to write for it.
      Any disagreement is a fatal verification failure. This is the check that catches a
      chunk insert that silently wrote nothing — exactly one extra query per run.
- [ ] The run exits **2** if any roll call failed tally verification, failed coverage, or
      failed reconciliation. It exits **0** otherwise. The existing `main().catch` path
      keeps exiting **1**, so a reader of a red cron can tell "the sync crashed" from "the
      sync ran and the data is wrong" without opening the log.
- [ ] **Failed *fetches* keep their current behaviour** — `fetchVotesBatched` warns loudly
      and the run still exits 0. A rate-limited fetch is transient and self-healing on the
      next run; making it fatal would paint slice 4's nightly red for a condition that
      needs no human. This slice adds loudness of the same shape, not a new fatal class.

**D. Failure behaviour and logging — exact**

- [ ] Every failing roll call prints one block to `stderr`, containing the roll call id, the
      verdict kind, the published numbers, the counted numbers, and the source URL:

      ```
      ✗ senate-119-2-108 bucket-mismatch — published yea=51 nay=47 present=0 not_voting=2 (100);
        counted yea=51 nay=46 present=0 not_voting=2 (99); differing buckets: nay
        source: https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00108.xml
        → quarantined, not written
      ```

- [ ] Every run prints one summary block to `stdout`, **on success as well as failure**, in
      the same register as the existing `⚠ N of M vote fetches failed` warning:

      ```
      Tally verification — 60 roll calls
        verified            59   published tally matched parsed positions, bucket for bucket
        total-only           0   candidate tally; member count checked
        no tally             1   chamber published none
        quarantined          0
        positions published   25,142
        positions stored      24,913
        positions skipped        229   (all attributed)
          198 not-in-roster   D000096 Norton, P000610 Plaskett, G000578 Gaetz, … (+9 more)
           31 no-crosswalk    S293 Graham, S419 Mullin
        unattributed             0
      ```

      The skipped-member list is **distinct member ids with names**, truncated to the first
      12 with a `(+N more)`, so the nightly log names who is missing rather than printing a
      count. A new departure appears as a new name and does **not** fail the run — a member
      leaving office is a normal event, and a per-run diff of that list is how slice 14's
      progress will be visible.
- [ ] **Interactive vs. unattended: the assertions and the exit code are identical. Only the
      presentation differs.** There is no environment-conditional threshold, no
      `--no-verify` flag, and no way to make a failing run green. An assertion that can be
      weakened by an environment variable is the failure mode this slice exists to prevent.
- [ ] When `process.env.GITHUB_ACTIONS === "true"`, the script **additionally**:
      - emits one `::error title=Tally verification failed::<roll call id> — <kind>` workflow
        command per failing roll call, so failures surface as annotations on the job without
        opening the log; and
      - appends the summary block, rendered as a Markdown table, to the file named by
        `process.env.GITHUB_STEP_SUMMARY` when that variable is set.
      Both are additive. The plain-text `stdout`/`stderr` output is emitted in both
      environments, unchanged.
- [ ] `.github/workflows/sync.yml` is **not modified** in this slice. The schedule stays
      commented out; re-enabling it is slice 4. A non-zero exit already fails a
      `workflow_dispatch` run today, which is how this is verified.

**E. Store the tally — `db/schema.ts` + migration**

Decision: **store it.** Reasons, on engineering merit, in order:

1. Checked only in flight, the invariant is verifiable **only at ingest time**. Stored, it
   becomes a standing invariant that one SQL query can re-check at any moment — which is
   how drift introduced by something *other* than the sync (a bad migration, a hand-run
   `UPDATE`, a half-applied backfill) gets caught.
2. It makes this slice's own acceptance criteria verifiable without re-fetching 1,573 XML
   documents — which is what writing this spec cost.
3. **Slice 14** (historical roster, which recovers these 4,902 positions) can prove the
   recovery with `SELECT … WHERE stored <> published` instead of a second full re-fetch of
   both chambers. That is the named consumer.
4. The not-voting/absent figure is otherwise unrecoverable for members outside the roster —
   it exists only in the chamber's own count.
5. Cost is four integers on 1,573 rows.

- [ ] `roll_calls` gains exactly four nullable integer columns:
      `published_yea`, `published_nay`, `published_present`, `published_not_voting`.
      No other column, table, index, constraint or enum changes. The names say *whose*
      numbers these are, so no future reader confuses them with a computed count.
- [ ] All four are `NULL` together when the chamber published no yea/nay tally
      (`kind: "none"` or `kind: "total"`). A candidate-shaped tally is **not** stored — the
      Speaker election's candidate totals are not positions and have no column.
- [ ] A new additive migration `drizzle/0003_*.sql`, generated by `npm run db:generate`
      (not hand-written), containing only `ALTER TABLE "roll_calls" ADD COLUMN …`, with
      `drizzle/meta/_journal.json` updated by the generator.
- [ ] `db/schema.test.ts` asserts all four columns exist on `roll_calls` and that `notNull`
      is `false` for each.
- [ ] The `rollCalls` insert in `scripts/sync-votes.ts` writes all four, and the
      `onConflictDoUpdate` `set:` clause includes all four, so a re-sync backfills existing
      rows.
- [ ] Nothing renders these columns. `roll_calls.result` still drives every badge; the
      scoreboard on `/votes/[id]` still counts `vote_positions`. **No file under `app/` or
      `components/` is touched by this slice.** The first UI consumer is Phase B's vote
      page, not this slice.

**F. Unit tests — `lib/tally.test.ts` (new) and `lib/votes.test.ts`**

`lib/tally.test.ts` covers `verifyTally` and `verifyCoverage` over hand-built inputs (no
XML). At minimum:

- [ ] **Exact match** — `{ kind: "buckets", yea: 51, nay: 47, present: 0, notVoting: 2 }`
      against 51 yea + 47 nay + 2 not_voting positions → `{ ok: true, kind: "verified",
      published: 100, counted: 100 }`.
- [ ] **Exact match with a real `present` bucket** — the `house-119-1-1` quorum-call shape
      (`yea: 0, nay: 0, present: 433, notVoting: 2`) against 433 present + 2 not_voting →
      `verified`. `present` is not a theoretical bucket: 1,065 rows carry it today.
- [ ] **Mismatch** — one nay short → `{ ok: false, kind: "bucket-mismatch" }` with `diffs`
      of length 1 naming `nay`, published 47, counted 46.
- [ ] **Compensating mismatch** — totals equal, two buckets swapped (yea 51/nay 47
      published, 47 yea / 51 nay counted) → `bucket-mismatch` with **two** diffs. A correct
      total must not pass.
- [ ] **Known-shape discrepancy** — the Senate case that is 780 roll calls today:
      `verifyTally` over the **parsed** positions → `verified`, and `verifyCoverage({
      parsedCount: 100, storedCount: 99, skipped: [{ memberId: "S293", reason:
      "no-crosswalk" }], budget: 5 })` → `{ ok: true }` with `residual` 0. The same input
      with `skipped: []` → `{ ok: false, reason: "unattributed" }`. **These two assertions
      together are the slice.**
- [ ] **Over budget** — 6 attributed Senate skips against `budget: 5` → `{ ok: false,
      reason: "over-budget" }`; 5 skips → `{ ok: true }`. And the House equivalent at the
      boundary, 20 and 21.
- [ ] **Negative residual** — `parsedCount: 99, storedCount: 100, skipped: []` →
      `{ ok: false, reason: "unattributed" }`.
- [ ] **Missing tally** — `{ kind: "none" }` against any positions → `{ ok: true, kind:
      "no-tally" }`, never a failure and never a silent pass labelled `verified`.
- [ ] **Malformed tally** — `{ kind: "malformed", reason }` → `{ ok: false, kind:
      "malformed-tally" }` carrying the reason string through.
- [ ] **Candidate tally** — `{ kind: "total", total: 434 }` against 434 positions →
      `total-only`; against 433 → `total-mismatch`.
- [ ] `COVERAGE_BUDGET` is asserted to be `{ house: 20, senate: 5 }`, so the numbers cannot
      drift without a test change that a reviewer sees.

`lib/votes.test.ts` covers tally **parsing** with XML fixtures, each a faithful reduction of
a real document fetched on 2026-09-24:

- [ ] Senate `<count>` with an empty `<present/>` (the `vote_119_2_00108.xml` shape) →
      `{ kind: "buckets", yea: 51, nay: 47, present: 0, notVoting: 2 }`. The empty element
      must yield `0`, not `NaN` and not `malformed`.
- [ ] Senate with no `<count>` block at all → `{ kind: "none" }`.
- [ ] Senate with all four children empty → `{ kind: "none" }`, **not** four zeros.
- [ ] Senate with a non-numeric `<yeas>` → `{ kind: "malformed" }`.
- [ ] House `<totals-by-vote>` (the `roll300.xml` 2026 shape: 214/211/0/8) →
      `{ kind: "buckets", … }`, and the three `<totals-by-party>` rows are asserted to sum
      to it.
- [ ] House `<totals-by-party>` rows that do **not** sum to `<totals-by-vote>` →
      `{ kind: "malformed" }`.
- [ ] House with only `<totals-by-candidate>` rows (the `house-119-1-2` Speaker-election
      shape) → `{ kind: "total", total: 434 }`.
- [ ] House with no `<vote-totals>` element → `{ kind: "none" }`.
- [ ] A single `<totals-by-party>` row parses as correctly as three — `fast-xml-parser`
      collapses a one-element list to an object, and the existing `asArray` helper is the
      only correct way to read it.
- [ ] Every one of the 118 currently passing tests across 7 files still passes, except where
      an existing `toMatchObject` on a parsed roll call is extended to cover `tally`.
      `npm test` reports more than 118 tests across 9 files.

**G. Re-sync and measured outcome**

- [ ] `npm run db:migrate` is applied against production Neon, then the 119th is re-synced
      for both sessions — `npm run sync:votes -- 700 2025` and
      `npm run sync:votes -- 700 2026` (700 clears the maxima: House 362/314, Senate
      659/238). On a senate.gov 403 wave, wait 5–10 minutes and re-run; everything is
      idempotent. Per `.claude/current-work.md` ("Agents run production migrations and
      re-syncs themselves") the developer runs this before the PR.
- [ ] After the re-sync, **1,572 of 1,573** roll calls have all four `published_*` columns
      non-null; exactly one — `house-119-1-2` — has all four null.
- [ ] After the re-sync, this query returns **0 rows**:

      ```sql
      SELECT rc.id FROM roll_calls rc
      JOIN (SELECT roll_call_id,
              count(*) FILTER (WHERE position='yea')         y,
              count(*) FILTER (WHERE position='nay')         n,
              count(*) FILTER (WHERE position='present')     p,
              count(*) FILTER (WHERE position='not_voting')  nv
            FROM vote_positions GROUP BY roll_call_id) s ON s.roll_call_id = rc.id
      WHERE rc.published_yea IS NOT NULL
        AND (s.y > rc.published_yea OR s.n > rc.published_nay
          OR s.p > rc.published_present OR s.nv > rc.published_not_voting);
      ```

      Stored can be short of published (the known gap) but must never **exceed** it in any
      bucket. Measured today: 0.
- [ ] After the re-sync, the total shortfall is reported in the PR description from:

      ```sql
      SELECT rc.chamber,
             sum(rc.published_yea + rc.published_nay
               + rc.published_present + rc.published_not_voting)::int AS published,
             count(vp.*)::int AS stored
      FROM roll_calls rc LEFT JOIN vote_positions vp ON vp.roll_call_id = rc.id
      WHERE rc.published_yea IS NOT NULL GROUP BY rc.chamber;
      ```

      Expected, unchanged by this slice because it stores no new positions: **House
      291,814 published / 287,721 stored; Senate 89,688 / 88,891**. A different number means
      the re-sync changed the corpus and needs explaining, not accepting.
- [ ] The re-sync run itself exits **0**. Its summary block reports `unattributed 0`,
      `quarantined 0`, `no tally 1`, and ~4,890 attributed skips over the 1,572 verified
      roll calls. The PR description pastes that block verbatim — it is the slice's proof.
- [ ] The PR description also records one deliberately-broken run: with a one-line local
      edit that drops a position from a parsed roll call, the sync prints the `✗` block,
      quarantines the roll call, and exits 2. The edit is **not** committed.

**H. `scripts/sync-members.ts` — out of scope, for a stated reason**

- [ ] `scripts/sync-members.ts` is **not modified.** There is no equivalent check available:
      `legislators-current.yaml` publishes no count of itself, so there is no second,
      independent number to assert against — which is exactly what makes the vote tallies
      checkable. Inventing a hardcoded "expect ~535" would be an assumption, not a
      verification, and this slice ships assertions grounded in what the source publishes.
- [ ] The genuine hazard in that script is recorded as carried finding 2 below rather than
      fixed here, because it becomes dangerous when the cron lands (slice 4), not now.

**I. Do not change**

- [ ] `fetchVotesBatched` keeps `BATCH = 5`, `PAUSE_MS = 400`, its `Promise.all` shape, and
      its loud `⚠ N of M vote fetches failed` warning. senate.gov 403s under aggressive
      fetching; this discipline is why the sync works.
- [ ] **This slice adds zero HTTP requests.** The tally is inside XML already downloaded.
      Request count, concurrency, endpoints and user-agent are byte-identical.
- [ ] Idempotence is preserved. Every write stays an upsert on its natural key —
      `bills.id`, `rollCalls.id`, `(rollCallId, legislatorId)` — and the 2,000-row chunk
      loop is unchanged. Running the sync twice in a row produces no errors and no changed
      row counts, and the post-write reconciliation passes on both runs.
- [ ] `lib/ids.ts`, `lib/legislation.ts`, `lib/members.ts`, `lib/format.ts` are untouched.
- [ ] `normalizePosition` is untouched (see criterion A and carried finding 1).
- [ ] No file under `app/` or `components/` is touched.

**J. Gate**

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` passes.
- [ ] Lands on branch `slice-03-self-verifying-ingest` via PR against protected `main`.
- [ ] No preview verification is required — this slice renders nothing. The proof is the
      two pasted run summaries (clean, and deliberately broken) and the three SQL results.

### Scope

**In**

- `lib/votes.ts`: the `PublishedTally` type, tally extraction in both parsers,
  `ParsedRollCall.tally`.
- New `lib/tally.ts`: `verifyTally`, `verifyCoverage`, `COVERAGE_BUDGET`, their verdict
  types. Pure, no I/O.
- New `lib/tally.test.ts`; tally-parsing fixtures added to `lib/votes.test.ts`.
- `db/schema.ts`: four nullable integer columns on `roll_calls` + generated migration
  `0003_*`; two assertions in `db/schema.test.ts`.
- `scripts/sync-votes.ts`: pre-write verification, quarantine, per-roll-call skip
  attribution, post-write reconciliation, the summary block, GitHub Actions annotations,
  exit code 2, and writing the four new columns in the insert and its `set:` clause.
- Production migration + re-sync of both 119th sessions.

**Out** — named so they do not get pulled in

- **Recovering the 4,902 dropped positions.** That needs `legislators-historical` and one
  term row per person-per-Congress — **slice 14**. This slice makes the loss impossible to
  ignore and gives slice 14 its acceptance test; it recovers nothing.
- **The multi-Congress schema rework** — slice 13. `roll_calls` gains four nullable columns
  and nothing else; no new table, no integer PK, no `legislator_terms`.
- **Re-enabling the nightly cron and the "data current as of" UI** — slice 4.
  `.github/workflows/sync.yml` is not edited. This slice is the precondition, not the
  delivery.
- **Bill `summary` / `short_title`** — slice 5, which also touches `scripts/sync-votes.ts`.
  Do not enrich `upsertBills` here beyond leaving it as it is.
- **`pg_trgm` and search** — slice 6. **Caching** — slice 7.
- **Any UI.** `published_*` is stored and rendered nowhere. Phase B (slices 8–12) owns the
  visual layer; no component, Tailwind token, or page query changes.
- **`scripts/sync-members.ts`** — criterion H.
- **Changing `normalizePosition`**, including for the Speaker election's candidate names —
  carried finding 1 and open question Q2.
- **Retrying or back-filling failed fetches**, and any change to fetch failure handling.
- **A quarantine table, a dead-letter queue, or persisting failures.** Zero roll calls
  quarantine today; a log line and exit 2 is the whole mechanism. Build the store when
  something lands in it.

**Decisions made here, not open**

1. **Verification compares the published tally to the _parsed_ positions, not the stored
   ones.** Measured: exact on 1,572 of 1,572 roll calls, bucket for bucket. Comparing
   against stored rows would fail on 1,388 of 1,573 and force a fudge factor that hides
   the next real bug. The parse-time assertion is strict and permanent; the storage gap is
   a separate, attributed measurement.
2. **A known discrepancy is one with a name on it.** `parsed − stored == skipped`, every
   skip carrying a member id and one of two reasons. A new discrepancy is a non-zero
   residual. This needs no threshold and no maintenance, and it stays correct as the roster
   churns — which a hardcoded "expect 4,902" would not.
3. **The coverage budget is a hard-coded constant in `lib/tally.ts`, not an environment
   variable.** A threshold the cron can raise is a threshold that gets raised at 2am. It
   lives in a unit-tested module so changing it is a reviewed diff.
4. **A run completes and then exits non-zero; it does not abort mid-flight.** Aborting on
   the first bad roll call abandons a batch of fetches that rate limits make expensive to
   repeat, and leaves a partial write whose extent depends on where it stopped. Completing
   the run means one pass produces the full list of what is wrong. Only the offending roll
   calls are withheld from the write.
5. **A roll call that fails tally verification is not written at all.** Its positions are
   the thing we cannot vouch for; storing them is precisely what this slice exists to
   prevent. Deterministic, so a re-run will not "fix" it — a human must look, which is the
   intent. Zero rows today, so the operational cost is zero.
6. **The Speaker election is verified on its total, not skipped.** `house-119-1-2` publishes
   a candidate tally whose rows sum to 434, and 434 members are listed. Checking the count
   is one extra branch and it closes the only permanent hole in coverage. It recurs once per
   Congress, and more in a multi-ballot election.
7. **Interactive and unattended runs assert identically.** Only the output format differs
   (`::error::` annotations and a step summary in Actions). Environment-conditional strictness
   is how a check rots into decoration.
8. **Failed fetches stay non-fatal.** Rate limiting is transient and self-heals on the next
   run; making it exit non-zero would make slice 4's nightly red for a condition needing no
   human, and a cron that cries wolf is the same failure as a cron that says nothing.
9. **The tally is stored.** Four nullable integers, named `published_*`. Reasons in
   criterion E; the named downstream consumer is slice 14, not the UI.

### Relevant files

- `/Users/ryanhayes/claude_code/hidden-figures/lib/votes.ts` — `parseHouseVote`
  (`vote-metadata` block) and `parseSenateVote` (`roll_call_vote.count`); the `asArray`
  helper is the only correct way to read `<totals-by-party>` / `<totals-by-candidate>`, which
  `fast-xml-parser` collapses to a bare object when there is one row. `normalizePosition` is
  here and must not change.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/tally.ts` — **new.** The pure verification
  module; the only new file in `lib/`.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/tally.test.ts` — **new.** Where criterion F's
  first block lives.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/votes.test.ts` — XML fixtures for tally
  parsing; the existing fixtures show the expected reduction style.
- `/Users/ryanhayes/claude_code/hidden-figures/scripts/sync-votes.ts` — `fetchVotesBatched`
  (~line 69, the rate-limit discipline that must not change); the LIS crosswalk loop
  (~line 216, source of `no-crosswalk`); the `known.has` filter and `skipped` count
  (~line 258, source of `not-in-roster`); the `rollCalls` insert and its
  `onConflictDoUpdate` (~lines 234 and 251); the 2,000-row `votePositions` chunk loop
  (~line 272, where reconciliation follows); `main().catch` (bottom, the existing exit 1).
- `/Users/ryanhayes/claude_code/hidden-figures/db/schema.ts` — the `rollCalls` table.
- `/Users/ryanhayes/claude_code/hidden-figures/db/schema.test.ts` — add the four nullability
  assertions beside the existing `description` / `result_text` ones from slice 1.
- `/Users/ryanhayes/claude_code/hidden-figures/drizzle/` — the generated `0003_*.sql` lands
  here; `meta/_journal.json` is generator-owned (last entry is `0002_productive_masked_marvel`).
- `/Users/ryanhayes/claude_code/hidden-figures/scripts/sync-members.ts` — read for criterion H
  and carried finding 2; **not modified**.
- `/Users/ryanhayes/claude_code/hidden-figures/.github/workflows/sync.yml` — read to confirm
  the schedule stays commented out and that a non-zero exit fails the job; **not modified**.
- `/Users/ryanhayes/claude_code/hidden-figures/.claude/specs/slice-01-readable-vote-descriptions.md`
  — the precedent for an additive nullable migration plus a production re-sync.
- `/Users/ryanhayes/claude_code/hidden-figures/CLAUDE.md` — the `lib/` purity convention that
  puts `verifyTally` where it can be unit-tested.

### Carried findings (raised here, deliberately not fixed)

1. **The Speaker election's 422 stored positions are all `not_voting`.** `house-119-1-2`
   carries candidate names in `<vote>` ("Johnson (LA)", "Jeffries", "Emmer"), and
   `normalizePosition` falls those through to `not_voting`. The new `total-only` check
   passes on this roll call — correctly, since 434 listed equals 434 published — while the
   positions themselves are semantically wrong. Changing `normalizePosition` would touch the
   parse of every one of the 377,034 stored rows, which is not a change to make inside a
   verification slice. See Q2. Natural home: slice 14, alongside the roster work, or a
   dedicated fix if the owner wants it sooner.
2. **`scripts/sync-members.ts` will mass-mark departures if its source is ever truncated.**
   Its `notInArray(legislators.id, rows.map(…))` update sets `in_office = false` for every
   member missing from the fetched YAML, with no floor on how many rows that YAML contained.
   A 200-record response — a valid parse of a partial file — would silently retire 330
   sitting members. Harmless while a human runs the script and reads the output; it becomes
   an unattended nightly write the moment slice 4 uncomments the cron. A one-line guard
   ("abort if `rows.length < 500`") belongs in **slice 4**, with the cron it protects.
3. **`legislators` holds 530 rows, all `in_office = true`, and not one departed member.**
   The `in_office = false` path in `sync-members.ts` has never fired, because members who
   left before the first sync were never inserted. This is the whole mechanism behind the
   4,093 House drops, and it confirms slice 14 (`legislators-historical`) is the right fix
   rather than a patch to the current-roster sync.
4. **The epic's "~3,300 dropped positions" is stale.** The measured figure is **4,902**, of
   which 4,093 are House. `.claude/current-work.md` should be updated when this slice lands,
   along with slice 14's description, which currently cites the old number.

### Open questions

**Q1. When the House coverage budget is breached before slice 14 lands, should the nightly
go red — or warn?**

The House per-roll-call shortfall is already 15 at its worst, against a budget of 20. Six of
those 15 are the non-voting delegates, a permanent floor that never shrinks; the rest are
members who left mid-Congress, and that number only grows for the remainder of the 119th.
Slice 4 puts this on a nightly cron. So there is a real chance that some evening in the
119th, a perfectly healthy sync exits 2 because one more member resigned.

- **Option A (assumed by the criteria above):** over-budget is fatal, exit 2, the nightly
  goes red. A red cron is a thing a person looks at, and what they would find is "slice 14 is
  now overdue", which is true and worth being told.
- **Option B:** over-budget warns loudly and exits 0; only an unattributed residual is fatal.
  The attribution check — the one that actually catches regressions — needs no budget, so
  Option B loses very little.
- **Option C:** raise the House budget to 30 and revisit at slice 14. Defers the question
  without answering it.

Recommendation: **Option A.** The residual check catches correctness regressions; the budget
exists to catch *degradation*, and degradation that nobody is told about is how you end up
with 4,902 silently missing positions in the first place. But this is a decision about how
much noise slice 4's cron is allowed to make, which is the owner's call, not the spec's. If
the owner picks B, the only change is the branch that sets the exit code — the check, the
log line and the tests are identical.

**Q2. Should this slice fix the Speaker election's positions, or verify and move on?**

Carried finding 1: `house-119-1-2`'s 422 stored positions are all `not_voting` because the
`<vote>` elements hold candidate names. The new check will pass that roll call — the counts
genuinely reconcile — which means this slice's first act is to bless a row it knows is wrong.
That is uncomfortable in a slice whose entire premise is "do not store what you cannot
vouch for".

The fix is not small in blast radius: either `normalizePosition` grows a "not a position"
case (which touches how every one of 377,034 rows is parsed, and `vote_position` is a
Postgres enum with no such value), or the Speaker election is excluded from
`vote_positions` altogether (which changes what `/votes/house-119-1-2` renders and would
delete 422 rows — this slice deletes nothing).

Recommendation: **verify and move on.** One roll call per Congress, no correct enum value to
put it in, and the honest fix is a schema question that belongs with slice 13/14. Raising it
because the owner may disagree that a knowingly-wrong row should be allowed through a check
called "self-verifying".

---

## Resolutions (orchestrator, 2026-09-24 — binding, these override the criteria above)

**Q1 → Option B: over-budget warns loudly and exits 0.**

Only an *unattributed* position fails the run. Rationale: the residual check is the actual
regression detector and needs no budget; the budget catches degradation, and a nightly that
goes red because one more member resigned is how people learn to ignore a red build.

Concretely, this changes the **exit-code mapping only** — keep `verifyCoverage` exactly as
specified, still returning `{ ok: false, reason: "over-budget" }` as a distinct verdict, and
keep its unit tests as written. What changes is what `scripts/sync-votes.ts` does with that
verdict:

| Condition | Exit | Output |
|---|---|---|
| `reason: "unattributed"` (residual ≠ 0, either sign) | **2** | `✗` block, as specified |
| `reason: "over-budget"` | **0** | A loud `⚠` block in the same register as the existing `⚠ N of M vote fetches failed` — naming the roll call, the count, the budget, and the member ids — plus a `::warning` annotation under GitHub Actions rather than `::error` |
| tally `bucket-mismatch` / `total-mismatch` / `malformed-tally` | **2** | `✗` block + quarantine, as specified |
| post-write reconciliation failure | **2** | as specified |

The summary block must state the over-budget count on its own line so a breach is visible
in a passing run, not buried. Everything else in criterion C and D stands unchanged.

**Q2 → verify and move on.** Do not change `normalizePosition`, do not exclude the Speaker
election from `vote_positions`, and do not delete any row. `house-119-1-2` passes on its
candidate total, which is the honest reading of what the House published. Carried finding 1
stays recorded for slice 13/14 to resolve alongside the enum question; it is not this
slice's to fix and the discomfort is noted rather than acted on.

---

## Resolution 3 (orchestrator, 2026-09-24) — the reconciliation check is asymmetric

Criterion C's post-write reconciliation ("read-back count must equal intended rows, any
disagreement fatal") is unsatisfiable on the live database, and the developer was right to
flag it rather than quietly substitute something else.

**Why it fails:** `legislators` holds `G000359` (Graham) with 830 stored Senate positions,
written by earlier syncs when `legislators-current.yaml` still carried his LIS id `S293`.
That id is gone from the YAML now, so the run correctly classifies him `no-crosswalk` and
intends one row fewer than the database already holds. Same for `S419` Mullin on the roll
calls he was still crosswalked for. These are valid pre-existing positions, and this slice
deletes nothing.

**The rule, replacing criterion C's equality assertion:**

| Read-back vs intended | Exit | Meaning |
|---|---|---|
| `got < want` | **2** | A write silently did not land. This is the failure the check exists for. |
| `got === want` | 0 | Clean. |
| `got > want` | **0**, with a warning | Rows exist that this run did not intend to write. Structurally this can only be history — the upsert is keyed on `(rollCallId, legislatorId)`, so a run cannot create rows it did not intend. Report it; do not fail on it. |

The surplus case must be **visible, not swallowed**: one line in the summary block giving the
number of roll calls with surplus rows and the total surplus, in the same register as the
over-budget line, plus a `::warning` annotation under GitHub Actions. It is a standing
measure of how much pre-slice-14 history the current roster can no longer account for, so it
should shrink to zero when slice 14 lands — record that expectation in the summary line's
wording.

Add a unit test for each of the three directions if the reconciliation comparison is
extracted into `lib/tally.ts`; if it stays inline in the script, say so and explain why.

**Two spec defects the developer found, both confirmed — the developer's corrections stand:**

- Criterion G's third query joins `roll_calls` to `vote_positions` before summing, so each
  roll call's published figure is multiplied by its own row count (it returns House
  124,385,674). The correct form aggregates position counts in a subquery first.
- Criterion F's "more than 118 tests across 9 files" is off by one: only `lib/tally.test.ts`
  is a new test file, so **8** files is correct.
