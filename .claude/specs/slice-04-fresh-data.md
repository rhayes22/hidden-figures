# Slice 4 — Fresh data

Epic: "Make the current Congress genuinely useful" (`.claude/current-work.md`, Phase A)
Written: 2026-09-24 · Status: **ready** — one open question (Q1), non-blocking; two owner
actions (O1, O2) that no agent can perform.

Every number below was measured on **2026-09-24** against production Neon (read-only) and
against `raw.githubusercontent.com/unitedstates/congress-legislators`. Measurements are
labelled where they appear; nothing here is estimated.

### Title

Re-enable the nightly sync and show how fresh the data is

### Problem

Two user-visible failures, one cause.

**The site goes stale without saying so.** `.github/workflows/sync.yml` has had its
`schedule:` trigger commented out since June. Between June and September the site served
three-month-old votes and every page presented them as current: the root metadata says
"updated daily", `/about` says "An automated job runs nightly", and nothing anywhere
contradicted either. A visitor could not tell a Congress in recess from a pipeline that had
stopped. Slice 3 shipped the verification that was the stated precondition for turning the
cron back on, so the block is lifted.

**Turning the cron on converts three known hazards from harmless to live.** Every one of
them is safe while a human runs the script and reads the output, and unsafe the moment a
robot runs it at 06:00 UTC and nobody reads anything:

1. Two fetch paths in `scripts/sync-votes.ts` still return empty and green. Slice 3 closed
   three of five; these two survived. `fetchHouseVotes` prints a bare
   `console.warn("No House votes found for 2026")` — no `⚠`, no annotation, no summary
   line. A Senate menu that answers HTTP 200 with an empty vote list produces **nothing at
   all**: `urls = []`, `failed = 0`, `menuUnavailable = false`, and a step summary reading
   `senate vote menu | ok`. A month of those is a green nightly and a frozen site.
2. `scripts/sync-members.ts` marks departures with
   `notInArray(legislators.id, rows.map(…))` and has no floor on how many rows the fetched
   YAML contained. A truncated-but-valid parse retires every member it does not mention.
   Carried finding 2 of slice 3, deferred here on purpose.
3. `scripts/sync-votes.ts`'s `loadRoster` has the same exposure with a quieter failure: a
   truncated roster makes every Senate position `no-crosswalk`, which is *attributed*, so
   slice 3's machinery warns and exits 0 — and the nightly stops storing Senate positions
   without ever going red.

**Measured state of the live database, 2026-09-24:**

| | roll calls | oldest | newest |
|---|---|---|---|
| House | 676 | 2025-01-03 | **2026-09-16** |
| Senate | 903 | 2025-01-09 | **2026-09-24** |
| total | 1,579 | | |

`legislators` holds 530 rows (430 House, 100 Senate), all `in_office = true`.
`legislators-current.yaml` holds **539 records**: 433 voting House + 100 Senate + 6
non-voting delegates that `toLegislatorRow` deliberately drops. All 100 senators carry an
`id.lis`, so the crosswalk is exactly 100 entries wide.

Note the eight-day spread between the chambers above. That is the House out of session, not
a broken feed — which is precisely the distinction the UI has to make.

### Acceptance criteria

---

**A. `.github/workflows/sync.yml` — the nightly runs again**

- [ ] The `schedule:` trigger is uncommented and active. The stale comment block explaining
      that it is paused is removed, not left above a live trigger.
- [ ] The cron is **`"17 6 * * *"`**. The 06:00 UTC hour is kept and is still right: it is
      01:00/02:00 ET depending on DST, after the prior legislative day's roll calls are
      published by both chambers, and off-peak for `clerk.house.gov` and `senate.gov`. The
      minute moves off `:00` because GitHub queues scheduled workflows most heavily on the
      hour; this job has no deadline, so trading a named minute for a shorter queue is free.
- [ ] The votes step's count becomes **75 per chamber** in both places — the
      `workflow_dispatch` input default and the `||` fallback the schedule uses:
      `${{ github.event.inputs.votes_per_chamber || '75' }}`. Measured justification: the
      busiest single day in the corpus is 24 roll calls (Senate) / 21 (House), but the
      busiest **rolling 3-day window** is 43 (Senate) / 32 (House) and the busiest rolling
      7-day window is **62 (Senate)** / 34 (House). The sync walks backwards from the latest
      roll call, so anything older than the window is a permanent hole until someone
      backfills by hand. 30 cannot survive two missed nights in a busy week; 75 self-heals a
      full week of missed nights with headroom over the measured maximum. Cost is 150 vote
      documents a night instead of 60, at the unchanged `BATCH = 5` / `PAUSE_MS = 400`
      discipline, and every write is an idempotent upsert.
- [ ] The `sync` job gains **`timeout-minutes: 30`**. `concurrency: { group: sync-data,
      cancel-in-progress: false }` means a hung run queues the next night behind it, and
      GitHub's default job timeout is 360 minutes. 30 is set against the first real run's
      measured duration (criterion E) and is revised in the same PR if that run exceeds 15
      minutes.
- [ ] Step ordering is unchanged: `sync:members` then `sync:votes`. This is deliberate and
      is stated in a comment — if the members step exits non-zero (including on the new
      roster floor, criterion C), the votes step is skipped and the run ingests nothing.
      That is the correct behaviour: both scripts read the same YAML, so a roster the
      members sync refuses is a roster the votes sync must not trust either.
- [ ] Nothing else in the workflow changes: no new steps, no `continue-on-error`, no
      `if: failure()` step, no matrix, no cache changes. A non-zero exit already fails the
      job; slice 3's `::error` / `::warning` annotations and step summary already make a red
      run legible without opening the log.

---

**B. Close the two remaining empty-but-green fetch paths — `scripts/sync-votes.ts`**

Both must signal in the **same three registers** slice 3 used for `menuUnavailable` and for
`⚠ N of M vote fetches failed`, and must be implemented by extending that pattern rather
than inventing a second one: a `⚠` line on stdout, an `annotate("warning", …)` call, and a
line in the summary block plus a row in the GitHub step summary table.

- [ ] **Neither path is fatal.** Slice 3's decision 8 stands: fetch-side failures are
      transient and self-healing, so they warn and the run still exits 0. Neither path may
      influence the exit code.
- [ ] **House probe failure.** `fetchHouseVotes`'s `if (!(await houseRollExists(1)))` branch
      replaces its bare `console.warn` with the full treatment. `FetchResult` (or the House
      return type) carries the state outward the way `menuUnavailable` does for the Senate,
      so `main` can render it in the summary — a `console.warn` inside the fetch function is
      exactly the shape being removed.
      - `⚠` line naming the year and the consequence, e.g.
        `⚠ no House roll calls are published for 2026 — this run covers the Senate only`.
      - `annotate("warning", "House roll feed unavailable", …)`.
      - Summary-block line, in the same register as the existing
        `⚠ the Senate vote menu was unavailable — this run covers the House only`.
      - Step-summary row `house roll feed` with value `ok` / `unavailable`, sitting beside
        the existing `senate vote menu` row.
      - The wording states the fact and does not assert breakage: in the first days of a
        calendar year this branch is legitimately true, and a nightly warning for two days
        each January is the accepted cost of the check. Say so in a comment.
- [ ] **Senate menu reachable but empty.** The Senate state stops being a boolean and
      becomes three-valued — `"ok" | "unavailable" | "empty"` — because HTTP 200 with zero
      votes is a third thing and `menuUnavailable: false` is a lie about it.
      - Triggered by `parseSenateVoteMenu(menuXml).length === 0`, i.e. the **source**
        yielded no votes. It must **not** fire because the run asked for none: with
        `votes_per_chamber: 0` the menu is still non-empty and the state stays `ok`.
      - `⚠` line, e.g. `⚠ the Senate vote menu was reachable but listed no roll calls for
        the 119th Congress, session 2 — no Senate votes were ingested this run`.
      - `annotate("warning", "Senate vote menu empty", …)`.
      - Summary-block line and step-summary row `senate vote menu | empty`. The existing
        `ok` / `unavailable` values keep their current meaning.
      - The existing `console.log("Senate: latest roll call is #none")` no longer stands as
        the only trace of this state.
- [ ] A unit test is **not** required for either path — both live in `scripts/`, which is
      not the tested layer, and neither has pure logic worth extracting. Verification is by
      inspection plus the two forced runs in criterion E.
- [ ] `fetchVotesBatched` is untouched: `BATCH = 5`, `PAUSE_MS = 400`, the `Promise.all`
      shape, and its existing warning all stay byte-identical.

---

**C. A roster-size floor, in both scripts, with the predicate in `lib/`**

- [ ] **One guard, shared, living in a new pure module `lib/roster.ts`.** Both scripts read
      the same file from the same URL, so two copies of the number would drift. The
      predicate is pure and therefore unit-testable, which is the whole reason it does not
      live in `scripts/` — the same split slice 3 made with `lib/tally.ts`.
- [ ] `lib/roster.ts` exports a floor table and a verdict function, shaped like
      `lib/tally.ts`: it returns a verdict and never logs, throws, or exits. The script
      decides what a verdict means.

      ```ts
      export const ROSTER_FLOOR: Record<"records" | "senate-crosswalk", number>;
      export type RosterCheck =
        | { kind: "records"; count: number }
        | { kind: "senate-crosswalk"; count: number };
      export type RosterVerdict =
        | { ok: true; kind: RosterCheck["kind"]; count: number; floor: number }
        | { ok: false; kind: RosterCheck["kind"]; count: number; floor: number; message: string };
      export function verifyRosterSize(check: RosterCheck): RosterVerdict;
      ```

- [ ] **`ROSTER_FLOOR.records = 500`**, checked against the length of the parsed YAML array.
      Justification against what the file actually contains: it holds **539 records today**
      (433 voting House + 100 Senate + 6 non-voting delegates), and its structural ceiling
      is 541 (435 + 100 + 6) at full occupancy. 500 tolerates 41 simultaneous vacancies —
      an order of magnitude beyond anything the 119th has seen — while catching any
      truncation that loses more than 7% of the file. 500 is also the number slice 3's
      carried finding 2 pre-registered, so adopting it keeps the review trail intact.
- [ ] **`ROSTER_FLOOR["senate-crosswalk"] = 90`**, checked against the size of the LIS →
      bioguide map. This is a *different* failure from truncation, which is why it is a
      second floor and not a redundant one: if the upstream project renames or drops
      `id.lis` wholesale, the record count stays 539 and every Senate position becomes
      `no-crosswalk` — attributed, so slice 3's checks warn and exit 0. Measured: exactly
      100 senators, all 100 carrying an `id.lis`. 90 tolerates ten simultaneously missing
      ids and catches a collapse.
- [ ] **A breach is fatal, before any write.** This is the one place this slice is stricter
      than slice 3's decision 8, and the reason is that a fetch failure writes nothing while
      a truncated roster writes *destructively*. Both scripts exit **2** — slice 3's
      established "the sync ran and the data is wrong" code, distinct from 1 for "the sync
      crashed" — print a `✗` block naming the check, the count and the floor, and emit
      `annotate("error", …)`.
- [ ] `scripts/sync-members.ts`: the check runs immediately after `parse(...)`, **before**
      the sponsorship fetch, before the upsert and before the `notInArray` update. Nothing
      is written and no Congress.gov requests are made on a breach. `main()` is restructured
      to return an exit code the way `sync-votes.ts` does, so the existing `.then(() =>
      pool.end())` can exit 2 without throwing; the `.catch` path keeps exit 1.
- [ ] `scripts/sync-votes.ts`: both checks run in `main` immediately after the
      `Promise.all([...])` destructure, **before** the LIS crosswalk loop and before
      `upsertBills` — the first write of the run. On a breach the run returns 2 without
      writing bills, roll calls or positions, and without printing the verification summary
      block (nothing was verified and nothing was written; the `✗` block is the whole
      output). This does **not** contradict slice 3's decision 4 ("a run completes and then
      exits non-zero"): that decision is about not abandoning fetched work mid-write on a
      per-roll-call failure. A roster breach is a precondition failure where no roll call
      can be safely written at all.
- [ ] `loadRoster` keeps throwing on a failed fetch (`yaml === null`) — that is a crash, not
      bad data, and exit 1 is right for it.
- [ ] **A House-only fallback is explicitly not built.** On a Senate-crosswalk breach the
      whole run aborts, including House positions that are keyed by bioguide and would be
      unaffected. One bad file means one bad night; a partial-write mode is a second code
      path to reason about for a failure that has never occurred.
- [ ] **`lib/roster.test.ts` (new)** covers, for each of the two check kinds: a count well
      above the floor passes; a count of 0 fails; a count one below the floor fails; a count
      exactly equal to the floor **passes** (the predicate is `count < floor`); and today's
      measured values (539 records, 100 crosswalk entries) pass. The failing verdict's
      `message` names the count and the floor.
- [ ] No floor, threshold or budget in this slice is readable from an environment variable.
      Slice 3's decision 3 stands: a threshold the cron can raise is a threshold that gets
      raised at 2am.

---

**D. "Data current as of" in the UI**

**D1 — the honest number, and where it comes from**

- [ ] **Two numbers are shown, not one, because they answer different questions.** The
      latest `vote_date` says how recent the *legislation* is; the last successful sync says
      whether the *pipeline* is alive. During a recess the first is old and nothing is
      wrong; when the sync breaks the second is old and everything is wrong. Today's data
      shows exactly why one number cannot do both: the newest House roll call is 2026-09-16
      and the newest Senate roll call is 2026-09-24.
- [ ] `max(vote_date)` across `roll_calls` — **not** per chamber. One line in a footer; the
      per-chamber split is a Phase B question.
- [ ] The last successful sync has nowhere to live today, so this slice adds the smallest
      store that answers it: a new table **`sync_runs`** in `db/schema.ts` —
      `id` (serial PK), `script` (text, `"votes"` or `"members"`), `startedAt`
      (timestamptz, not null), `finishedAt` (timestamptz, not null), `exitCode` (integer,
      not null). One index on `(script, finishedAt)`. Migration `drizzle/0004_*.sql` is
      generated with `npm run db:generate` and applied to production Neon with
      `npm run db:migrate` (standing decision: agents run production migrations themselves).
      `db/schema.test.ts` gains assertions for the table, its columns and their nullability,
      beside the existing ones.
- [ ] Both scripts insert exactly one `sync_runs` row per run, immediately before
      `pool.end()`, recording the exit code they are about to return — **including a
      non-zero one**. A run that throws records nothing, which is itself detectable as a
      missing row. This is why the reader filters on `exit_code = 0`: a run that exited 2
      ran, but its data cannot be vouched for.
- [ ] The reader is one query, one round trip:

      ```sql
      SELECT (SELECT max(vote_date) FROM roll_calls) AS latest_vote,
             (SELECT max(finished_at) FROM sync_runs
               WHERE script = 'votes' AND exit_code = 0) AS last_checked
      ```

**D2 — the decision, pure and tested**

- [ ] The healthy/stale/unknown decision is pure and lives in **`lib/freshness.ts` (new)**,
      not in the component, so it is unit-testable — the same reason `lib/tally.ts` exists.
      It takes `{ latestVoteDate: string | null, lastCheckedAt: Date | null, now: Date }`
      and returns a discriminated union; `now` is injected so tests do not depend on the
      clock.
- [ ] **Three states, exhaustively:**

      | State | Condition | Rendered |
      |---|---|---|
      | `current` | `lastCheckedAt` is within **48 hours** of `now` | `Latest roll call Sep 24, 2026 · data checked Sep 25, 2026` |
      | `stale` | `lastCheckedAt` is older than 48 hours | `⚠ Data may be out of date — last checked Sep 20, 2026 (5 days ago)` |
      | `unknown` | `lastCheckedAt` is null, or the query failed | **nothing renders** |

- [ ] **48 hours, not 24.** The job runs at 06:17 UTC, so a healthy value is up to ~24 hours
      old just before the next run and a single missed or queue-delayed night reaches ~48.
      A threshold of 24 or 36 would put a warning on the live site for a delay that needs no
      human. 48 means two consecutive failures raise it, which is the first point at which
      something is actually wrong.
- [ ] **`unknown` renders nothing, deliberately.** A footer that claims freshness it cannot
      verify is the bug this slice exists to fix; silence is the honest output, and a
      missing line is visible to the owner. It must never render "unknown", "—", or a
      zero date.
- [ ] Dates are **absolute, not relative**, because these pages are cached for up to an hour
      (criterion D4) and "checked 5 hours ago" rots inside a cache entry. The day count in
      the `stale` string is floor-of-full-days, so an hour of cache staleness cannot move it
      by more than one day at a boundary.
- [ ] Dates render through the existing `formatDate` in `lib/format.ts` (UTC, `Sep 24,
      2026`). No new date helper, no new dependency.
- [ ] **`lib/freshness.test.ts` (new)** covers: a check 1 hour old → `current`; 47h59m →
      `current`; exactly 48h → `stale` (the boundary is `> 48h`, stated in the test name);
      5 days → `stale` with `daysSinceCheck === 5`; `lastCheckedAt: null` → `unknown`;
      `latestVoteDate: null` with a fresh check → `unknown` (there is nothing to be current
      *about*); and that a `latestVoteDate` far older than the check does **not** produce
      `stale` — the recess case, which is the whole point of the two numbers.

**D3 — where it renders**

- [ ] A new server component **`components/data-freshness.tsx`**, rendered site-wide in the
      existing footer of `app/layout.tsx`, as a sibling of the existing bottom line
      (`Not affiliated with any government body…`) inside that same `border-t` row. Every
      page shows data, so every page states its freshness; one placement, not five.
- [ ] It queries `db` directly and inline, per the standing convention (there is no query
      layer, and CLAUDE.md says not to introduce one casually).
- [ ] **Minimal markup, existing tokens only.** It reuses the footer's `text-xs
      text-gray-500`; the `stale` state uses the existing `text-flag-red` token. No new
      Tailwind token, no new colour, no icon library, no layout beyond making that bottom
      row a two-item flex that stacks on mobile. Phase B (slices 8–12) owns the visual
      layer and will re-place this; leave it easy to move.
- [ ] Wrapped in `<Suspense fallback={null}>` so the footer query never blocks the page's
      HTML, and so a slow DB degrades to a missing line rather than a slow site.
- [ ] **On query failure it renders nothing.** The query is wrapped so that any thrown error
      resolves to the `unknown` state. A database hiccup must not 500 every page on the
      site, which is what an unguarded query in the root layout would do.
- [ ] `/about` gains `export const revalidate = 3600`. It is the page that says "An
      automated job runs nightly", it is fully static today (confirmed in the build route
      table: `○ /about`), and a build-time value baked there would be the exact failure this
      slice fixes. One line; no other change to that page's copy.
- [ ] The component renders nothing when `process.env.NEXT_PHASE ===
      "phase-production-build"` — the same guard `db/index.ts` already uses. This keeps a
      build-time value from being baked into any prerendered route (`/_not-found` is the one
      that cannot be given a `revalidate`), at the cost of `/about` showing no line for up
      to an hour after a deploy. Silence for an hour beats a wrong date forever.
- [ ] No other page, component or query changes. `app/page.tsx` is not modified.

**D4 — behaviour under caching, so slice 7 does not redesign this**

- [ ] **Invariant, stated for slice 7 to preserve: the rendered freshness value is never
      more than one hour older than the database.** That holds today by construction —
      `/`, `/members`, `/bills` and the party pages are `force-dynamic` (always fresh),
      `/members/[id]` and `/votes/[id]` are `revalidate = 3600`, and `/about` becomes 3600
      by this criterion.
- [ ] **No route's rendering mode changes**, other than `/about` moving from static to ISR.
      The component must not call `connection()`, `headers()`, `cookies()` or any other
      request-time API: without `cacheComponents` enabled (it is not — see
      `next.config.ts`), a dynamic API inside the layout would opt `/members/[id]` and
      `/votes/[id]` out of the deliberate on-demand ISR that CLAUDE.md tells you to keep.
      Verified by comparing `npm run build`'s route table before and after: `ƒ` and `●`
      markers unchanged, `/about` the only line that moves.
- [ ] **The read is in exactly one place** — `components/data-freshness.tsx` — so slice 7
      has one file to touch. When slice 7 drops `force-dynamic` from the list pages, it must
      give this read its own cache entry with its own ≤1h lifetime and its own tag, so the
      footer is invalidated by the ingest rather than pinned to whatever lifetime the page
      around it acquires. Write that requirement as a comment in the component, naming
      slice 7, so the constraint travels with the code.
- [ ] Nothing in this slice enables `cacheComponents`, adds `use cache`, or introduces a
      revalidation tag. Those are slice 7's, and this criterion exists so slice 7 can add
      them without redesigning the indicator.

---

**E. Verify the cron's first real run, end to end**

Assumption is not verification. Three runs, in this order.

- [ ] **E1 — a real unattended run, before merge.** `workflow_dispatch` is already on the
      workflow and can be dispatched against the feature branch, so this does not wait for a
      night. Dispatch `Sync data` on `slice-04-fresh-data` with the default
      `votes_per_chamber`. This exercises the genuine unattended path: GitHub runner, repo
      secrets (not `.env`), production Neon, `GITHUB_ACTIONS=true` so the annotations and
      step summary are live. Record in the PR description: the run URL, the conclusion, the
      **wall-clock duration** (which sets `timeout-minutes`), the rendered step summary
      table verbatim, and the values of the two new step-summary rows
      (`house roll feed`, `senate vote menu`).
- [ ] **E2 — idempotence under the runner.** Dispatch a second time immediately. It must be
      green, and these counts must be identical across the two runs (the query goes in the
      PR description):

      ```sql
      SELECT (SELECT count(*) FROM roll_calls)     AS roll_calls,
             (SELECT count(*) FROM vote_positions) AS positions,
             (SELECT count(*) FROM legislators)    AS legislators;
      ```

      Baseline to compare against, measured 2026-09-24 before this slice: 1,579 roll calls,
      530 legislators. Roll calls may **increase** between E1 and the baseline if the
      chambers voted in between; between E1 and E2, minutes apart, they must not move.
- [ ] **E3 — a red run is actually red.** Confirm on the runner, not by reading the YAML,
      that a non-zero exit fails the job and produces a visible failure. Do it without
      adding a "make it fail" switch — slice 3 explicitly refused a `--no-verify` flag, and
      a deliberately broken commit on `main` is worse. Acceptable method: push a scratch
      branch carrying a one-line edit that trips the roster floor (e.g. slicing the parsed
      records array), dispatch the workflow against **that branch**, confirm the job
      conclusion is `failure`, the `::error` annotation appears on the run summary, and the
      members step's failure **skips** the votes step. Record the run URL in the PR
      description and delete the scratch branch. Nothing from it is merged.
- [ ] **E4 — after merge, confirm the schedule itself fires.** A `workflow_dispatch` proves
      the job; only a scheduled run proves the schedule, and schedules only run on the
      default branch. Within 48 hours of merge, confirm in the Actions history that a run
      with trigger `schedule` exists, its conclusion is `success`, and:

      ```sql
      SELECT script, max(finished_at), max(exit_code) FROM sync_runs GROUP BY script;
      ```

      returns a `votes` row from that run with `exit_code = 0`, and the site footer's
      "data checked" date has advanced to it. This is a follow-up check, not a merge
      blocker — record it in `.claude/current-work.md` under "Now" so it is not forgotten.

---

**F. Does a human notice a red nightly?**

A cron that fails into an empty inbox is the same failure as no cron. Three answers, of
which only the first is this slice's code.

- [ ] **In-product (this slice).** The `stale` state in criterion D2 is the alarm that needs
      no configuration and no third party: two consecutive failed or missing nights and the
      site itself says so, on every page, to the owner and to every visitor.
- [ ] **O1 — owner action, GitHub failure email.** GitHub emails the actor of a failed
      *scheduled* run — the account that last modified the cron, which will be whoever
      merges this. It depends on account settings no agent can read or change. The owner
      confirms at github.com/settings/notifications that Actions notifications are enabled
      with at least "Send notifications for failed workflows only", and confirms the email
      lands by checking for one after E3's deliberately red run. Record the outcome in
      `.claude/current-work.md`.
- [ ] **O2 — owner awareness, the 60-day rule.** GitHub automatically disables scheduled
      workflows in a public repository after 60 days with no repository activity, and sends
      a notice when it does. `hidden-figures` is under active development so this is not a
      live risk today, but it is exactly the kind of thing that silently stops a nightly
      during a quiet stretch — and the stale indicator from criterion D is what would
      surface it. Record it as a standing note in `.claude/current-work.md`; no code.
- [ ] Anything louder — a Slack webhook, a PagerDuty route, an auto-filed issue on failure —
      is **not** built here. See Q1.

---

**G. Housekeeping**

- [ ] `.claude/current-work.md`: tick slice 4 with its spec path, move "Now" on to slice 5,
      and record the E4 follow-up, O1's outcome and O2's note. While in the file, apply
      slice 3's carried finding 4: the epic's "~3,300 dropped positions" is stale — the
      measured figure is **4,902**, of which 4,093 are House — in both the Context section
      and slice 14's backlog line.
- [ ] `docs/expansion/` is still untracked. Commit it (standing item, noted in three prior
      slices).
- [ ] No copy change to `/about`'s "An automated job runs nightly" or the root metadata's
      "updated daily". Both become true again when this ships.

---

**H. Do not change**

- [ ] `lib/tally.ts`, `lib/votes.ts`, `lib/ids.ts`, `lib/legislation.ts`, `lib/members.ts`
      and `lib/format.ts` are untouched. Slice 3's verification is finished work.
- [ ] `fetchVotesBatched`'s rate-limit discipline, the LIS crosswalk loop, the quarantine
      logic, the coverage budget, the reconciliation read-back and the exit-code mapping all
      stay as slice 3 shipped them. This slice adds one new fatal condition (the roster
      floor) ahead of them and changes none of them.
- [ ] `upsertBills` is not enriched — bill `summary` / `short_title` are slice 5, which also
      touches this file.
- [ ] No page under `app/` other than `app/layout.tsx` and `app/about/page.tsx`. No existing
      component is modified. `app/page.tsx` in particular is not touched: slice 11
      redesigns it and slice 7 changes its caching.
- [ ] Request count to `clerk.house.gov`, `senate.gov` and `api.congress.gov` per document
      is unchanged. The only volume change is the 30 → 75 window in criterion A.

---

**I. Gate**

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` passes. Baseline to
      beat: **151 tests across 8 files**, all passing. After this slice: 10 files
      (`lib/roster.test.ts`, `lib/freshness.test.ts` are new) and more than 151 tests.
- [ ] Verified visually in the PR's Vercel preview: the footer line present and correct on
      `/`, on a member detail page, and on `/bills`; nothing rendered on a 404. A screenshot
      of the footer goes in the PR description.
- [ ] Lands on branch `slice-04-fresh-data` (already checked out) via PR against protected
      `main`.

### Scope

**In**

- `.github/workflows/sync.yml` — schedule on, cron `17 6 * * *`, count 75,
  `timeout-minutes: 30`.
- `scripts/sync-votes.ts` — the two empty-but-green paths, the two roster floors, the
  `sync_runs` row.
- `scripts/sync-members.ts` — the records floor, an exit-code-returning `main`, the
  `sync_runs` row.
- `lib/roster.ts` + `lib/roster.test.ts` — **new**, pure.
- `lib/freshness.ts` + `lib/freshness.test.ts` — **new**, pure.
- `db/schema.ts` + `drizzle/0004_*.sql` + `db/schema.test.ts` — the `sync_runs` table;
  migration applied to production Neon.
- `components/data-freshness.tsx` — **new**, server component.
- `app/layout.tsx` — one footer insertion. `app/about/page.tsx` — one `revalidate` line.
- `.claude/current-work.md` — criterion G.

**Out** — named so they do not get pulled in

- **Backfilling the gap the paused cron left.** The corpus is current as of today
  (2026-09-24) because slice 3 re-synced it. If a gap is ever found, `npm run sync:votes --
  <n> <year>` is the existing tool; this slice adds no backfill mechanism.
- **Detecting a source that returns empty forever.** Criterion B makes each empty fetch
  loudly visible per run, and criterion D makes a dead *pipeline* visible in the UI. Neither
  distinguishes "Congress is in a long recess" from "both chambers' feeds have been
  returning nothing for a month" — the House's measured 54-day and the Senate's 37-day
  recess gaps look identical to a dead feed from the database's side. Named as a residual
  limitation, not solved.
- **Notifying anywhere other than GitHub's own email and the site footer.** See Q1.
- **Recording warnings in `sync_runs`.** `exit_code` only. A run that exits 0 with an empty
  Senate menu records as successful, and the annotations are where that shows. A
  `warning_count` column is easy to add later if the footer ever needs to distinguish them.
- **`permissions: contents: read` on the job.** Correct hardening, not asked for, and not
  about freshness. One line whenever someone is next in the file.
- **A per-chamber freshness line, a freshness API route, a `/status` page, or a chart of
  sync history.** One footer line. Phase B owns the visual layer.
- **The multi-Congress schema rework** (slice 13) and **the historical roster** (slice 14).
  `sync_runs` is a new standalone table with no FK to anything, so it survives both.
- **Bill summaries** (slice 5, also touches `scripts/sync-votes.ts`), **`pg_trgm` search**
  (slice 6), **caching** (slice 7). Criterion D4 is the handshake with slice 7.
- **Any redesign.** No new Tailwind token, no change to the `flag-*` palette, no new
  component beyond the one indicator.
- **Cleaning up slice 2's carried findings**, including the one that becomes live with this
  slice ("a bill whose only roll calls are amendment votes loses its Bills-tab card" — it
  goes live the first night the cron lands a bill mid-amendment-series). Still Phase B's.

**Decisions made here, not open**

1. **Two numbers, not one.** `max(vote_date)` and the last successful sync answer different
   questions and the difference is exactly the recess-versus-broken case. Shipping one
   number would mean shipping a line that is wrong for a month every summer.
2. **The freshness threshold is 48 hours.** One missed night is noise; two is a signal.
3. **`unknown` renders nothing.** Silence over an unverifiable claim.
4. **The roster floor is fatal and pre-write, unlike slice 3's fetch warnings.** A failed
   fetch writes nothing; a truncated roster writes destructively. Different hazard,
   different verdict.
5. **The floors are 500 records and 90 crosswalk entries**, both measured against a file
   that holds 539 and 100 today, both hard-coded in a unit-tested `lib/` module.
6. **The nightly window is 75 per chamber**, sized to the measured 7-day maximum (62,
   Senate) so a week of missed nights self-heals rather than leaving a permanent hole.
7. **The cron hour stays at 06:00 UTC; only the minute moves.** The hour was chosen for the
   right reason and that reason has not changed.
8. **`sync_runs` is a table of runs, not a single-row state.** Identical cost, and it makes
   "which night did this stop working?" answerable with one query instead of a guess.
9. **The indicator is one site-wide footer line, not per-page.** Every page serves data, so
   every page states its freshness, and Phase B has one thing to move.

### Relevant files

- `/Users/ryanhayes/claude_code/hidden-figures/.github/workflows/sync.yml` — the two
  commented lines and the comment block above them (top of file); the `workflow_dispatch`
  input default and the `${{ github.event.inputs.votes_per_chamber || '30' }}` fallback on
  the last line; the `concurrency` block that makes `timeout-minutes` matter.
- `/Users/ryanhayes/claude_code/hidden-figures/scripts/sync-votes.ts` — `fetchHouseVotes`
  (line 117; the bare `console.warn` is line 119); `fetchSenateVotes` (line 137, where
  `menuUnavailable` is the pattern to copy and where the empty-menu case falls through);
  `loadRoster` (line 169, the crosswalk build); `main`'s `Promise.all` destructure (line
  301, where the floor checks go); `annotate` (line 251, the three-register helper); the
  summary `lines` array and the `GITHUB_STEP_SUMMARY` `rows` array (lines 575 and 613,
  where the `senate vote menu` row already lives); `main().then` at the bottom, where the
  `sync_runs` insert goes before `pool.end()`.
- `/Users/ryanhayes/claude_code/hidden-figures/scripts/sync-members.ts` — `main` (line 65)
  for the post-parse floor check; the `notInArray` update (line 116) that the floor
  protects; `main().then(() => pool.end())` at the bottom, which has no exit-code path today.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/tally.ts` — the shape to copy for
  `lib/roster.ts`: pure, verdict-returning, constants exported, no logging and no exit.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/format.ts` — `formatDate` (UTC-safe,
  `Sep 24, 2026`), the only date helper the indicator needs.
- `/Users/ryanhayes/claude_code/hidden-figures/app/layout.tsx` — the footer's closing
  `<p className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500">` (line 166),
  where the indicator becomes a sibling.
- `/Users/ryanhayes/claude_code/hidden-figures/app/about/page.tsx` — "How often it updates"
  (line 50); the page that gains `revalidate`.
- `/Users/ryanhayes/claude_code/hidden-figures/db/schema.ts` — where `syncRuns` is added;
  `/Users/ryanhayes/claude_code/hidden-figures/db/schema.test.ts` for its assertions;
  `/Users/ryanhayes/claude_code/hidden-figures/db/index.ts` for the
  `NEXT_PHASE === "phase-production-build"` guard the component reuses.
- `/Users/ryanhayes/claude_code/hidden-figures/drizzle/meta/_journal.json` — last entry is
  `0003_volatile_shatterstar`, so the generated migration is `0004_*`.
- `/Users/ryanhayes/claude_code/hidden-figures/.claude/specs/slice-03-self-verifying-ingest.md`
  — the three Resolution blocks (exit-code mapping, asymmetric reconciliation) and carried
  finding 2, which is criterion C's origin.
- `/Users/ryanhayes/claude_code/hidden-figures/CLAUDE.md` — the rendering-strategy split
  (`force-dynamic` list pages, ISR detail pages with an empty `generateStaticParams`) that
  criterion D4 must not disturb, and the `lib/` purity convention behind C and D2.

### Open questions

**Q1. Beyond a red job and a stale footer, does a failed nightly need to reach the owner
anywhere else?**

This slice ships two notifications: the site says it is stale after two bad nights, and
GitHub emails the cron's actor on a failed scheduled run (subject to O1). Neither is a push
alert, and the email depends on a setting no agent can verify.

- **Option A (assumed by the criteria):** email + stale footer, no code. Zero new secrets,
  zero new failure modes, and the footer alarm is the one that fires even when the job never
  ran at all — which is the failure mode email cannot cover.
- **Option B:** an `if: failure()` step that opens a GitHub issue via `GITHUB_TOKEN`. No
  secret needed, but it needs `issues: write` on the job and it cuts against the standing
  decision that this project's work items live in `.claude/specs/`, not GitHub Issues.
- **Option C:** an `if: failure()` step posting to a Slack or Discord webhook. The loudest
  option and the only one that reaches a phone, but it needs the owner to create the webhook
  and add a repo secret — an outward-facing action an agent must not take.

Recommendation: **A now, C later if A proves too quiet.** The honest test is E3: if the
owner does not receive an email from the deliberately red run, A has already failed and C
is worth the setup. This is a preference about how loud the project should be, which is the
owner's call, not the spec's.

**Owner actions, not blockers:** O1 (confirm Actions failure email) and O2 (acknowledge
GitHub's 60-day scheduled-workflow disablement) in criterion F. Work can start without
either.

---

*Nothing in this spec was executed against production: the database was read, never
written, and no workflow run was triggered. Criteria E1–E4 and the migration are the
implementing developer's to run, per the standing decision that agents run production
migrations and re-syncs themselves.*

---

## Resolution (orchestrator, 2026-09-24)

**Q1 → ship A as specified.** Email plus the stale footer is the starting position. E3 is the
honest test: if no failure email arrives from a genuinely red job, escalate to an
issue-on-failure step or a webhook — but do not add either speculatively, and do not add a
step that needs an owner-created secret without asking first. The stale footer is the alarm
that needs no configuration and fires even when the job never ran at all, which is the
failure mode a notification can't cover.

**O1 and O2 are owner actions, not developer actions.** Report them at sign-off; do not
attempt to change repository or account notification settings.
