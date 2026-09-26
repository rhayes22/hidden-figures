# Slice 5 — Bill summaries

Epic: "Make the current Congress genuinely useful" (`.claude/current-work.md`, Phase A)
Written: 2026-09-25 · Status: **ready** — two open questions (Q1, Q2), neither blocking.

Every number below was measured on **2026-09-25**: against production Neon (read-only) and
against `api.congress.gov`, over **all 509 bills in the database**, not a sample. Where a
number came from a smaller probe it says so. Nothing here is estimated.

### Title

Populate bill summaries from Congress.gov and show them on vote pages

### Problem

All 509 bills carry an official title and nothing else. `bills.summary` and
`bills.short_title` have existed since migration `0000_ordinary_paibok.sql` and are **NULL
for all 509 rows** — the columns were added at the start and never filled.

An official title is not an explanation. Measured over the 509 stored titles:

| bill type | bills | median title length | 90th pct | over 100 chars |
|---|---:|---:|---:|---:|
| hr | 264 | 41 | 85 | 21 |
| hres | 94 | **315** | **1,243** | 78 |
| sjres | 63 | **184** | 315 | 59 |
| s | 35 | 44 | 74 | 2 |
| hjres | 25 | **252** | 327 | 23 |
| hconres | 16 | **144** | 178 | 13 |
| sres | 9 | **132** | 142 | 8 |
| sconres | 3 | **203** | 213 | 3 |

191 of 509 bills have a title over 120 characters; 44 are over 400; the longest is 1,955.
Those are not names, they are legislative boilerplate — `hres-354-119` opens "Providing for
consideration of the joint resolution (H.J. Res. 60) providing for congressional
disapproval under chapter 8 of title 5, United States Code, of th…" and runs on for another
1,800 characters. A reader arriving at that vote page learns nothing about what was voted
on, which is the one thing the site exists to tell them.

Congress.gov publishes a CRS-written plain-English summary for most of them, and the sync
already holds an API key and already calls the bill endpoint. It has simply never asked for
the summary.

**What this slice would cover, measured across all 509 bills:**

- **456 of 509 bills (89.6%)** have at least one CRS summary.
- **1,032 of 1,116 bill-linked roll calls (92.5%)** would gain one — **65.4% of all 1,579
  roll calls**. The remaining 463 roll calls have no bill (nominations, cloture, procedural
  motions) and are slice 1's territory, not this slice's.
- 53 bills have no summary at all, concentrated in simple resolutions: **hres 25/90,
  sjres 16/63, sres 5/9**, hjres 2/25, hconres 1/16, hr 4/258, s 0/35, sconres 0/3.

---

### The three decisions this slice turns on

Stated up front because the acceptance criteria below only make sense against them.

#### 1. Which summary version — the latest, by `actionDate` then `updateDate`

CRS rewrites the summary as a bill moves. Measured across the 446 bills that returned
summaries in the full sweep: **377 have exactly one**, 61 have two, 7 have three, 1 has
five. So the choice only bites on 69 bills — but it has to be deterministic.

Take the summary with the greatest `actionDate`; break ties on the greatest `updateDate`.
**Six bills have two summaries sharing an `actionDate`**, so the tie-break is load-bearing,
not decorative.

Why latest and not "Introduced": `bills.status` and `bills.latest_action_date` are already
the *latest* action ("Became Public Law No: 119-21"). Pairing that with an as-introduced
summary would put two different moments in the bill's life next to each other on the same
page. Length is not a tiebreaker either way — measured first-version plaintext median is
762 characters against 810 for the latest, i.e. the same.

`versionCode` is **not** ordinal and must not be sorted on. Measured on `hr-1-119`: Passed
Senate is `55` on 2025-07-01, Public Law is `49` on 2025-07-04.

**No summary → the column stays NULL and nothing renders.** No placeholder, no "summary not
available" line. 53 bills is 10% of the corpus and a repeated apology on 10% of pages is
worse than silence.

#### 2. `short_title` is **not** populated in this slice, and the fallback chain does not change

This was measured specifically, because it looked like the obvious companion change. It is
not worth having. Three findings, in increasing order of severity:

**(a) `bills.title` is already the short title wherever one exists.** 258 of the 299 `hr`
and `s` bills already have a stored title ending in "Act" / "Act of YYYY" — median length
41 and 44 characters. In a 72-bill stratified probe, **20 bills had a whole-bill short title
and 16 of those were byte-identical to the title already stored.**

**(b) The bills that actually need a short title cannot get one.** The long-title problem
lives entirely in `hres` / `sjres` / `hjres` / `hconres` / `sconres` / `sres` — and in the
probe, **0 of 49 sampled bills of those types had any short title at all**. Congress.gov
does not publish one for them. Meanwhile only 23 of 299 `hr`/`s` bills have a title over
100 characters; all 23 were checked individually:

- **13 have no whole-bill short title.**
- 7 have one that is barely shorter (`hr-8646-119`: 105 chars → 105; `hr-6938-119`:
  111 → 110).
- **3 are genuine wins** — `hr-1442-119` 111 → "Youth Poisoning Protection Act",
  `hr-1346-119` 125 → 55, `hr-4541-119` 107 → 33.

So the whole 509-bill corpus yields roughly **three** materially better headlines.

**(c) The selection rule is ambiguous and demonstrably picks wrong.** Congress.gov exposes
21 distinct `titleTypeCode` values across the probe, including five "…for portions of this
bill" types that name a *different* bill folded into the vehicle. Measured failures of a
"latest whole-bill short title wins" rule:

- `s-1318-119` offers `"Fallen Servicemembers Religious Heritage Restoration Act"` and
  `"Foreign Intelligence Accountability Act"` — two unrelated names for one record.
- `hr-3838-119` offers `"SPEED Act"` and a 121-character variant; latest-wins picks the
  121-character one, i.e. it fails at the one thing it exists to do.
- `hr-1-119`'s `titleTypeCode` 27 is `"FEHB Protection Act of 2025"`. Naming the One Big
  Beautiful Bill Act after a federal-employee health provision is the failure mode.

**And the win is already free.** **268 of the 446 summaries (60%)** open with
`<p><strong>…</strong></p>` carrying the popular name — `hr-10326-119`'s summary begins
"Preventing Rip-offs and Obtaining Oversight of Funds Act or the PROOF Act". Rendering the
summary delivers most of what `short_title` promised, at no extra request and no chain
change.

**Consequence for carried warning (a): it does not fire in this slice.** Nothing enters
`bill_title → description → question`, so `leadTextFor` is untouched and the display sites
do not change. The warning is not dismissed — it is deferred with its trigger intact, and
the criteria below pin it so a future slice cannot walk into it. See criterion F.

#### 3. `lib/` extraction (option a), not a `scripts/` test harness (option b)

The reviewer asked this slice to choose. **Option (a)**, and this slice's shape forces it
anyway: picking a version and converting CRS HTML to text is pure, has a measured input
vocabulary, and has exactly the failure modes a unit test catches. It goes in a new
`lib/bill-summary.ts` beside `lib/tally.ts`, `lib/roster.ts` and `lib/votes.ts` — the same
split slices 3 and 4 made, zero new machinery, and consistent with CLAUDE.md scoping unit
tests to `lib/`.

**Option (b) is rejected and does not belong to any Phase A slice.** The evidence is in
`current-work.md`: a QA harness attempting it mis-resolved a module mock and **wrote rows 8
and 9 into production `sync_runs`**. A test harness that can reach the production database
is a larger hazard than the untested signal paths it would cover, and no non-production
database exists — the first one is the Neon branch that "Notes for next session" reserves
for **slice 13**. That is where this lands, as a carried finding, not here.

**Be honest about what (a) buys.** It adds one more tested pure module. It does **not**
cover the four untested signal paths in `scripts/sync-votes.ts` the reviewer named; those
stay exactly as untested as they are today. Criterion G records that rather than letting
the extraction imply a coverage it does not provide.

---

### API shape and request cost

Measured against `api.congress.gov` on 2026-09-25.

**The base bill endpoint does not carry the summary.** `GET /v3/bill/{congress}/{type}/{number}`
— the call `fetchBillRow` already makes — returns only a sub-resource pointer:

```
summaries -> {"count": 5, "url": "https://api.congress.gov/v3/bill/119/hr/1/summaries?format=json"}
```

So this is **an additional endpoint call per bill**, not one more field on the existing
call. There is no cheaper shape available.

**`GET /v3/bill/{congress}/{type}/{number}/summaries?format=json&limit=250`** returns:

```jsonc
{ "pagination": { "count": 5 },
  "summaries": [
    { "actionDate": "2025-05-20", "actionDesc": "Introduced in House",
      "updateDate": "2025-05-22T17:15:29Z", "versionCode": "00",
      "text": "<p><strong>One Big Beautiful Bill Act</strong></p><p>This bill reduces taxes…" } ] }
```

`limit=250` is **required, not cosmetic**: the default page size is 20 and the sibling
`/titles` endpoint was measured truncating at 20 of 37 for `s-2296-119`. Summaries max out
at 5 today, so `limit=250` costs nothing and removes the failure mode permanently. Verified:
with `limit=250`, `pagination.count` equalled the returned array length on all 499 bills
that answered.

**Request cost against the 20,000/hour measured limit.**

| | requests | share of 20,000/hr |
|---|---:|---:|
| nightly today (`fetchBillRow` only) | ~60 | 0.3% |
| **nightly after this slice** | **~120** | **0.6%** |
| one-off backfill of 509 bills | 509 | 2.5% |
| (rejected) if `short_title` were added too | ~180 / 1,018 | 0.9% / 5.1% |

The ~60 is measured, not assumed: the latest **75 roll calls per chamber** — what the cron
actually fetches — contain **108 bill-linked roll calls resolving to 60 distinct bills**
(43 House, 20 Senate, 3 shared). The busiest rolling 7-day window in the whole corpus is 23
distinct bills, so 60 is the steady-state ceiling, not an average. Doubling it leaves a
**167× headroom factor**.

**Transient failures are real and must be designed for.** The full 509-bill sweep produced
**10 HTTP 503s (2.0%)** at BATCH=5 with 250 ms pauses — concurrency was not the cause. All
ten succeeded on a plain retry and all ten have summaries. Criterion B turns this into two
requirements: a retry, and a `coalesce` upsert that can never write NULL over a stored
summary.

### Summary length, measured — this is what drives the rendering

Plaintext length of the selected (latest) summary, after tag stripping, across all 446 bills
that have one:

| min | p25 | p50 | p75 | p90 | p95 | p99 | max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 49 | 460 | **810** | 1,305 | 1,694 | 1,800 | 11,335 | **167,482** |

| over | bills | share |
|---|---:|---:|
| 1,000 chars | 167 | 37.4% |
| 2,000 | 13 | 2.9% |
| 5,000 | 7 | 1.6% |
| 10,000 | 5 | 1.1% |
| 50,000 | 2 | 0.4% |

The distribution is **not** the 11,032-character monster slice 1 hit — the typical summary
is a readable 810 characters, about three paragraphs (median 3, p90 6). But the tail is far
worse than slice 1's: `hr-1-119` is **167,840 characters**. Total plaintext across all 446
bills is **735 KB**, trivial against a 65 MB database on a 500 MB tier.

**Summaries contain HTML.** Measured tag vocabulary across every summary of all 446 bills —
this is the complete list, nothing else appears:

`p` (9,486) · `li` (3,206) · `strong` (634) · `ul` (608) · `em` (386) · `a` (196) ·
`br` (196) · `b` (18) · `i` (6) · `sub` (2)

The **only** attribute that appears anywhere is `a href` (98 occurrences), pointing at
`www.congress.gov`, `www.federalregister.gov` and one `eplanning.blm.gov`. No `script`,
`style`, `iframe`, `img`, or `on*` handler occurs. The only entities are `&nbsp;` (2,203)
and `&amp;` (23). 67 of 446 (15%) use `<ul>`/`<li>` lists.

### Acceptance criteria

---

**A. `lib/bill-summary.ts` — a new pure module, the only new logic in `lib/`**

- [ ] The module is pure: no database, no `fetch`, no clock, no logging, no throwing. It
      takes API-shaped input and returns a value, in the shape `lib/tally.ts` and
      `lib/roster.ts` established. Exported surface:

      ```ts
      export type ApiSummary = {
        actionDate: string;
        actionDesc: string;
        updateDate: string;
        versionCode: string;
        text: string;
      };
      // Picks the summary that describes the bill as it now stands.
      export function selectSummary(summaries: readonly ApiSummary[]): ApiSummary | null;
      // CRS HTML -> the plain text stored in bills.summary.
      export function summaryToText(html: string): string;
      // The two composed: what the sync and the backfill both store.
      export function summaryTextFor(summaries: readonly ApiSummary[]): string | null;
      ```

- [ ] `selectSummary` returns the element with the greatest `actionDate`, ties broken by the
      greatest `updateDate`, and `null` for an empty array. It **must not** sort on
      `versionCode`. A test asserts the `hr-1-119` ordering explicitly: Passed Senate
      (`versionCode` `55`, `actionDate` 2025-07-01) loses to Public Law (`versionCode` `49`,
      `actionDate` 2025-07-04).
- [ ] A test covers the measured `actionDate` tie — two summaries on the same date, the
      greater `updateDate` winning. Six bills in production depend on this.
- [ ] `summaryToText` converts to plain text. It must:
      - emit a blank line for `</p>` and for an opening `<p>`;
      - emit a line break for `<br>` / `<br/>`, `</li>` **and `</ul>`**;
      - render `<li>` as `• `;
      - strip every remaining tag;
      - decode `&nbsp;` to a space and `&amp;` to `&` (the only two entities measured);
      - collapse runs of spaces/tabs, collapse three-or-more newlines to two, and trim.
- [ ] **A regression test for the list-run-on bug.** Converting only on `</p>` merges the
      last list item into the following paragraph. Measured on `hr-10326-119`, a naive
      converter produces `…vulnerable to fraud.A federal agency may only use…`. The test
      asserts a break lands between them.
- [ ] A test asserts the full measured tag vocabulary is handled without leaking markup:
      `p, li, ul, strong, em, a, br, b, i, sub`. In particular `<a href="…">CRS In Focus
      13134</a>` yields `CRS In Focus 13134` and no URL, and `<strong>` yields its text.
- [ ] `summaryToText("")` and `summaryTextFor([])` return `""` and `null` respectively; a
      summary that strips to whitespace yields `null` from `summaryTextFor`, never `""`, so
      the column is NULL rather than empty.
- [ ] **The stored value is plain text, not HTML.** Three reasons, recorded in a comment:
      the site would otherwise render third-party markup it does not control; `lib/` is the
      only tested layer, so the conversion belongs where a test can reach it; and slice 6's
      trigram index wants words, not `<a href>`. No sanitiser dependency is added, and no
      `dangerouslySetInnerHTML` appears anywhere in this change.

---

**B. `scripts/sync-votes.ts` — the nightly stores summaries for the bills it touches**

- [ ] `fetchBillRow` gains a **second** request, to
      `/v3/bill/{congress}/{billType}/{number}/summaries?format=json&limit=250`, and fills
      `summary` on the returned `BillRow` via `summaryTextFor`. `limit=250` is present and a
      comment says why (the sibling `/titles` endpoint was measured truncating at the
      default 20).
- [ ] The two requests for one bill are issued concurrently. `BATCH = 12` in `upsertBills`
      is **unchanged**, so peak in-flight goes from 12 to 24 — 0.6% of the 20,000/hr limit
      at the measured 60 bills a night, against a 167× headroom factor. The stale comment
      `// Fetch titles in parallel batches (rate limit is 5,000/hr)` is corrected to the
      measured 20,000/hr and to the fact that two documents are now fetched per bill.
- [ ] **One retry on a non-ok summaries response**, after a short fixed delay, before giving
      up. Justification in a comment: 10 of 509 requests (2.0%) returned HTTP 503 on first
      attempt in the 2026-09-25 sweep and all 10 succeeded on retry.
- [ ] **A failed summaries fetch must never clear a stored summary.** After the retry, a
      still-failing request yields `summary: null` on the row, and the upsert uses
      `summary: sql\`coalesce(excluded.summary, "bills"."summary")\`` — the same pattern and
      the same reasoning as slice 3's `published_yea`/`published_nay` columns. A bill that
      genuinely has no summary has nothing stored to preserve and still lands as NULL. This
      is the class of bug `sync-members.ts`'s sponsorship nulling already represents
      (carried finding, `current-work.md`); this slice must not add a second instance.
- [ ] `title`, `status` and `latest_action_date` keep their existing bare `excluded.*`
      writes. Only the new column gets `coalesce`.
- [ ] A failed summaries fetch warns in the register slices 3 and 4 established — a `⚠` line
      naming the bill id, and `annotate("warning", …)`. It is **not** fatal and **must not**
      influence the exit code: a missing summary is cosmetic, self-heals on the next night,
      and slice 3's decision 8 puts fetch-side failures in the warn-and-continue class.
- [ ] `short_title` is **not** written. It is not read, not fetched, and `/titles` is never
      called. The column stays NULL on all 509 rows.
- [ ] **Untouched, byte for byte:** `fetchVotesBatched` including `BATCH = 5` and
      `PAUSE_MS = 400`; `houseRollExists` / `findLatestHouseRoll`; the three-valued
      `SenateMenuState`; `loadRoster`; the `verifyRosterSize` floors and their exit-2
      behaviour; `verifyTally` / `verifyCoverage` / `verifyReconciliation` and the
      quarantine set; the roll-call and position upserts; the summary block; the
      `GITHUB_STEP_SUMMARY` table; the `syncRuns` row; and the 0/1/2 exit-code contract.
- [ ] `.github/workflows/sync.yml` is **not modified**. No new step, no new secret, no
      schedule change, no `votes_per_chamber` change.

---

**C. `scripts/backfill-bill-summaries.ts` — a new script, because the nightly cannot do this**

- [ ] **A backfill script is mandatory, not a convenience.** The nightly only upserts bills
      reachable from the latest 75 roll calls per chamber. A bill whose last roll call was in
      January 2025 is never revisited, so waiting for the cron leaves those rows NULL
      forever. Stated in a comment at the top of the file.
- [ ] The script reads bill ids from the database, calls **only** `api.congress.gov`, and
      never fetches `clerk.house.gov` or `senate.gov`. Measured runtime for all 509 bills at
      BATCH=5 with a 250 ms pause: **87 seconds, 509 requests, 2.5% of the hourly limit**.
- [ ] It takes an optional congress number argument, defaulting to every congress present in
      `bills`. Slice 16 ("Historical bill metadata") needs exactly this script against the
      117th and 118th; a one-off would be deleted and rewritten.
- [ ] It writes **only** `bills.summary`, through the same `coalesce` upsert as criterion B.
      It must not touch `title`, `status`, `latest_action_date`, `short_title`, or any other
      table. In particular it writes **no `sync_runs` row** — `sync_runs` means "a scheduled
      ingest ran", the footer and the 48-hour stale alarm read it, and production already
      carries four rows that are not real CI runs (ids 1, 7, 8, 9). A comment says so.
- [ ] Idempotent and re-runnable. Running it twice produces the same rows.
- [ ] It prints a summary block in the slice-3 register: bills considered, summaries written,
      bills the API reported zero summaries for, and bills whose request failed after the
      retry — each failure named by bill id, not counted.
- [ ] **Exit 2 if any bill failed after its retry**, distinguishing "the script ran and the
      data is incomplete" from exit 1 "the script crashed", per slice 3's contract. A bill
      the API reports zero summaries for is **not** a failure and does not affect the exit
      code.
- [ ] It is wired as `npm run backfill:summaries` in `package.json`, beside the existing
      `sync:*` scripts. It is **not** added to `sync:all` and **not** added to the workflow.

---

**D. Run the backfill against production**

Per the signed-off decision "Agents run production migrations and re-syncs themselves".

- [ ] The backfill is run against production Neon and the result is reported to the owner:
      how many rows were written, how many bills have no summary, how long it took.
- [ ] **No migration is generated or applied.** `bills.summary` and `bills.short_title` have
      existed since `drizzle/0000_ordinary_paibok.sql` and are already nullable `text`.
      `npm run db:generate` must produce no new file; if it does, something else changed and
      the change is wrong. `db/schema.ts` is not edited, and `db/schema.test.ts` needs no
      new assertion.
- [ ] Post-backfill verification queries, run and reported:
      - `select count(*) from bills where summary is not null` — **expected 456 of 509**
        (89.6%, measured 2026-09-25; a few more if CRS has published since).
      - `select count(*) from bills where short_title is not null` — **must be 0**.
      - `select count(*) from roll_calls rc join bills b on b.id = rc.bill_id where
        b.summary is not null` — **expected 1,032 of 1,116** bill-linked roll calls (92.5%).
      - `select max(length(summary)) from bills` — expected ~167,840 (`hr-1-119`).
      - No stored summary contains `<` followed by a letter, i.e. no markup survived the
        conversion.

---

**E. Rendering — `/votes/[id]` only**

- [ ] `getRollCall` in `app/votes/[id]/page.tsx` adds `b.summary AS bill_summary` to its
      existing `LEFT JOIN bills`, and the return type gains `bill_summary: string | null`.
      No new query, no second round trip.
- [ ] The summary renders **beneath** the existing `<ExpandableTitle>`, the question line and
      the parent-bill line, and **above** the scoreboard section. It sits inside the existing
      page markup: no new section wrapper, no card, no heading.
- [ ] It renders only when `bill_summary` is non-null. There is no empty state and no
      placeholder — 53 bills and 84 bill-linked roll calls show nothing extra, exactly as
      today.
- [ ] Paragraph breaks survive. The stored text carries `\n\n` between paragraphs and `• `
      list bullets, so the block uses the stock Tailwind utility `whitespace-pre-line`.
      **No new theme token is defined and `app/globals.css` is not edited** — Phase B owns
      the palette.
- [ ] **The block is clamped with an expand toggle, not shown in full.** Median 810
      characters is fine; the p99 is 11,335 and `hr-1-119` is 167,840, which would bury the
      scoreboard and the roster. Clamp to 6 lines, expandable to full.
- [ ] **No new component.** `components/expandable-title.tsx` already implements exactly
      "clamp, with a Show full / Show less toggle that works on touch". Generalise it in
      place — the same file and the same client component, parameterised with the clamp depth
      and the button labels. The `<h1>` keeps its current behaviour byte for byte: clamp 2,
      `long = text.length > 70`, "Show full title" / "Show less". The summary uses clamp 6
      and "Show full summary" / "Show less".
- [ ] **Tailwind v4 scans source text, so `line-clamp-${n}` will not be generated.** The
      component maps the clamp depth to a literal class name (`line-clamp-2`,
      `line-clamp-6`). A dynamically composed class here fails silently in production and
      passes every check locally.
- [ ] The summary is never rendered as HTML. No `dangerouslySetInnerHTML` appears in the
      diff.
- [ ] **`generateMetadata` uses the summary for the meta description.** The current
      description is boilerplate that runs past 200 characters; the summary's opening is
      what a search result should show. The new shape composes a prefix with a clamped body:

      ```
      const prefix = `${Chamber} vote, ${formatDate(rc.vote_date)}: `;
      description: prefix + truncate(rc.bill_summary ?? <current fallback text>,
                                     META_DESCRIPTION_MAX - prefix.length)
      ```

      `META_DESCRIPTION_MAX` is a named constant of **160**. The `<title>` is unchanged and
      still uses `truncate(subject, 70)`.
- [ ] Newlines must not reach the meta description — the summary's `\n` are collapsed to
      single spaces before truncation.

---

**F. `lib/format.ts` — the `truncate` guard, now that a caller computes its budget**

Criterion E is exactly the caller the previous reviewer pre-registered: `truncate(body,
META_DESCRIPTION_MAX - prefix.length)`, where `prefix.length` varies with the chamber name
and the formatted date. The latent bug becomes reachable, so it is fixed here.

- [ ] **Confirmed bug, reproduced 2026-09-25:** `truncate("Hello world", 0)` returns
      `"Hello worl…"` — **11 characters, longer than the input budget and longer than the
      input itself is allowed to be** — because `slice(0, -1)` wraps from the end.
      `truncate("Hello world", -3)` returns `"Hello w…"`.
- [ ] `truncate` returns a string of length `<= max` for **every** integer `max`, including
      `0` and negatives. `max <= 0` returns `""`.
- [ ] Tests are added to `lib/format.test.ts` beside the three existing `truncate` cases:
      `max = 0` returns `""`; a negative `max` returns `""`; `max = 1` returns `"…"`; and a
      property-style case asserting `truncate(s, n).length <= Math.max(0, n)` over a small
      table of budgets including 0 and −5.
- [ ] The three existing `truncate` tests still pass unchanged.
- [ ] **`leadTextFor` is not modified and neither are its five call sites** —
      `app/page.tsx:55`, `app/bills/page.tsx:73`, `app/members/[id]/page.tsx:240`,
      `app/votes/[id]/page.tsx:101` and `:132`. `short_title` does not enter the chain
      (decision 2), so there is nothing to keep in step. A comment on `leadTextFor` records
      the measurement and the trigger for the future slice that revisits it:

      > A short title is deliberately absent from this chain. Measured 2026-09-25: it would
      > change roughly three of 509 bills, Congress.gov publishes none for the resolution
      > types whose titles are actually long, and the selection rule picks a different
      > bill's name on `s-1318-119`. If a future slice populates `bills.short_title`, it
      > enters **here** and at `app/bills/page.tsx`'s grouped-bill card, which is the one
      > remaining inline `bill_title ?? question` — both must change together or `<title>`
      > and `<h1>` will describe the same vote differently.

---

**G. The gate, and what is honestly not covered**

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` passes.
- [ ] The existing 47 tests across 10 files still pass; the new work adds tests to
      `lib/bill-summary.test.ts` and `lib/format.test.ts` only.
- [ ] Verified visually in a running preview against live Neon, after the backfill: a bill
      vote with a typical summary, a bill vote with a list (`hr-10326-119`), the
      167,840-character case (`hr-1-119`) collapsed and expanded, and a bill vote with **no**
      summary showing no empty block. Checked at 320 px — the summary block must not force
      horizontal scroll.
- [ ] **Recorded in `current-work.md`'s Carried findings, not fixed here:** the four signal
      paths in `scripts/sync-votes.ts` remain untested, and this slice's `lib/` extraction
      does not change that. A `scripts/` test harness needs a non-production database, the
      first of which is the Neon branch reserved for **slice 13**; a previous attempt without
      one wrote rows 8 and 9 into production `sync_runs`.
- [ ] Slice 5's backlog line in `.claude/current-work.md` is ticked with the date, and its
      two carried notes are marked resolved: the fallback chain is untouched by decision, and
      `truncate`'s guard is added with a live caller.

---

### Scope

**In:**

- `lib/bill-summary.ts` + `lib/bill-summary.test.ts` — version selection and HTML→text.
- The `max <= 0` guard in `lib/format.ts`, with tests.
- A second Congress.gov request per bill in `scripts/sync-votes.ts`'s `fetchBillRow`, a
  retry, and a `coalesce` upsert of `bills.summary`.
- `scripts/backfill-bill-summaries.ts` + an `npm run backfill:summaries` entry, run once
  against production.
- `bill_summary` on the `/votes/[id]` query; the summary block on that page; the
  `ExpandableTitle` → `ExpandableText` generalisation; the meta description.

**Out — named so they are not pulled in:**

- **`bills.short_title`.** Stays NULL. Decision 2, measured.
- **The `/titles` endpoint.** Never called. Note for whoever revisits it: pass `limit=250`,
  it truncates at 20 (`s-2296-119` returns 20 of 37).
- **Summaries on `/bills`.** Measured cost of adding `b.summary` to that query: the page
  selects one row per roll call, so 1,116 rows would carry **12.28 MB** of summary text —
  `hr-1-119` alone contributes 7.52 MB across its 47 roll calls. Slice 7 is already
  chartered to *reduce* what that query ships (~200 KB of description text today). Out.
- **Summaries on `/` and `/members/[id]`.** Same duplication shape, same reason, and both
  render truncated one-line subjects where a summary has nowhere to go.
- **A bill detail page.** There is none today — `/bills` cards route straight to the latest
  roll call. Creating one is a Phase B surface, and the epic explicitly excludes a redesign
  of `/bills`.
- **Rendering CRS HTML, and any sanitiser dependency.** Plain text at ingest instead.
- **`app/globals.css`, any new theme token, any new component.** Phase B (slices 8–12).
- **A `scripts/` test harness.** Decision 3 → slice 13.
- **Centralising `app/bills/page.tsx`'s remaining inline `latest.bill_title ?? latest.question`.**
  It is the one display site `leadTextFor` does not cover, but with `short_title` unpopulated
  the change is behaviour-neutral refactoring. It is named in the `leadTextFor` comment
  (criterion F) so the slice that populates `short_title` cannot miss it.
- **`.github/workflows/sync.yml`**, the `BATCH = 5` / `PAUSE_MS = 400` chamber-fetch
  discipline, slice 3's verification and exit codes, slice 4's roster floors and freshness
  indicator, the ISR config on detail pages, and `force-dynamic` on the list pages.
- **Deleting the four bogus `sync_runs` rows** (ids 1, 7, 8, 9). A production write and the
  owner's call.
- **`docs/PROJECT.md`.** Slice 6 owns the doc correction pass.

### Relevant files

- `/Users/ryanhayes/claude_code/hidden-figures/lib/bill-summary.ts` — **new.** The only new
  logic. Pure, tested, shaped like `lib/tally.ts`.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/bill-summary.test.ts` — **new.**
- `/Users/ryanhayes/claude_code/hidden-figures/scripts/sync-votes.ts` — `fetchBillRow`
  (line 220) gains the second request; `upsertBills` (line 249) gains the `coalesce` write
  and the corrected rate-limit comment. Everything else in this 745-line file is untouched.
- `/Users/ryanhayes/claude_code/hidden-figures/scripts/backfill-bill-summaries.ts` —
  **new.** The nightly structurally cannot reach older bills.
- `/Users/ryanhayes/claude_code/hidden-figures/app/votes/[id]/page.tsx` — `getRollCall`
  (line 28) adds `b.summary`; `generateMetadata` (line 97) composes the new description;
  the summary block goes after the parent-bill line at line 175.
- `/Users/ryanhayes/claude_code/hidden-figures/components/expandable-title.tsx` —
  generalised in place; the `<h1>` behaviour is preserved exactly.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/format.ts` — `truncate` (line 75) gets
  the `max <= 0` guard.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/format.test.ts` — the three existing
  `truncate` cases at line 46 stay; boundary cases are added.
- `/Users/ryanhayes/claude_code/hidden-figures/lib/legislation.ts` — **comment only**, on
  `leadTextFor` (line 49). No behaviour change.
- `/Users/ryanhayes/claude_code/hidden-figures/db/schema.ts` — **read only.** Both columns
  already exist; no migration.
- `/Users/ryanhayes/claude_code/hidden-figures/app/bills/page.tsx` — **read only.** Named so
  it is consciously left alone: the inline chain at line 116, and the 12.28 MB reason not to
  add summaries here.
- `/Users/ryanhayes/claude_code/hidden-figures/package.json` — one `backfill:summaries` line.

### Open questions

**Q1 — Is "latest" the right version for a bill that later became law? Non-blocking.**
The rule in decision 1 gives `hr-1-119` its 167,840-character Public Law summary rather than
its 98,717-character as-introduced one. Both are unreadable at that size, so the choice does
not matter for that bill; it affects 69 bills with more than one version, and for the other
68 both versions are in the normal length band. The rule is internally consistent with
`bills.status` already showing the latest action, so it ships as specified. If the owner
prefers "as introduced" — the version closest to what most people mean by "what does this
bill do" — it is a one-line change in `selectSummary` and a re-run of the backfill. **Not a
blocker; implement latest.**

**Q2 — Should the two 50,000+ character summaries be capped at ingest? Non-blocking.**
Two bills exceed 50,000 characters and `hr-1-119` reaches 167,840, which ships in the RSC
payload of its 47 vote pages. Storing the full text is specified because truncation at
ingest is lossy and irreversible, the total across all 446 bills is only 735 KB, and slice 6
will want the whole text indexed. The render-side clamp keeps the page usable. If page
weight proves to be a real problem it belongs to **slice 7** (caching), which is already
chartered to reduce payloads, not to this slice. **Implement uncapped.**

**Not open, recorded so they are not re-litigated:** whether `short_title` is worth
populating (no — decision 2, measured three times); whether this is a `fetchBillRow` field,
an extra call, or a backfill (extra call *and* a backfill, both, for the reasons in the
cost table and criterion C); whether to adopt a `scripts/` test harness (no — decision 3,
→ slice 13); whether a migration is needed (no — columns exist since migration 0000).
