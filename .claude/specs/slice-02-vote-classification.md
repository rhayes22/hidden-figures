# Slice 2 — Correct vote classification

Epic: "Make the current Congress genuinely useful" (`.claude/current-work.md`, Phase A)
Written: 2026-09-24 · Status: **draft** — one open question (Q1), non-blocking; the
acceptance criteria below assume the recommended answer.

All counts in this spec were measured against the live production database on
2026-09-24 (1,573 roll calls · 509 bills · 461 bill-less roll calls), after slice 1's
re-sync. They supersede the pre-re-sync figures quoted in the epic (584 House votes,
65 House amendments).

### Title

Classify amendment votes as amendments, and make the breakdown table sum

### Problem

**1. Amendment votes are filed as bills.** `lib/legislation.ts` exposes two
classifiers and every call site picks between them inline, on the wrong signal —
whether the roll call has a `bill_id`:

```ts
const category = billType ? categoryForBillType(billType) : categoryForQuestion(question);
```

So a roll call whose question is "On the Amendment" is filed as a *bill* purely
because it is linked to one. Every amendment vote in the database is linked to a
parent bill (slice 1 completed that linkage), so:

- `/bills` → the **Amendments tab reads 0**, and 188 real amendment votes are
  invisible — absorbed into their parent bill's single card.
- The homepage House breakdown reports **0 amendments** while 90 House roll calls
  are votes on amendments; the Senate reports 0 while 98 are.

**2. The breakdown table does not sum.** The House tab reports
`VOTED ON 676 · PASSED 513 · FAILED 162`. 513 + 162 = 675, one short. The Senate
tab is worse: `897 · 621 · 260` — 16 short. Diagnosed against the live data: the
`votePhase` predicates `/pass|agreed|confirm/` and
`/reject|fail|not agreed|negatived/` match neither of these 17 rows —

| chamber | result | rows | what it is |
|---|---|---|---|
| house | `Johnson (LA)` | 1 | the Speaker election; the Clerk puts the winner's name in the result field |
| senate | `Joint Resolution Defeated` | 4 | a failure the predicate misses |
| senate | `Bill Defeated` | 4 | a failure the predicate misses |
| senate | `Point of Order Sustained` | 2 | genuinely neither |
| senate | `Point of Order Well Taken` | 2 | genuinely neither |
| senate | `Decision of Chair Sustained` | 2 | genuinely neither |
| senate | `Decision of Chair Not Sustained` | 2 | genuinely neither |

Eight rows are misclassified (`Defeated` is a failure). Nine are honestly neither
passed nor failed, and the table has no column that can hold them, so it silently
drops them and prints three numbers that contradict each other.

The same pass/fail predicate is spelled a **second** time, differently, in
`components/vote-status.tsx` (`kindFor`, which additionally matches `adopt`). The
vote page badge and the `/bills` card badge can therefore disagree about the same
result — today "Bill Defeated" is gray-neutral in both, but only by coincidence.

**3. Amendment vote pages hide the amendment.** The lead-text chain is
`bills.title → description → question`, so all 188 amendment votes headline their
*parent bill's* title. The amendment's own text — which slice 1 fetched and stored —
appears nowhere. Fifteen separate Perry amendments to H.R. 4553 all headline the
identical string "Energy and Water Development and Related Agencies Appropriations
Act, 2026" and are indistinguishable from each other and from the bill's own
passage vote.

### Acceptance criteria

**A. One precedence rule, stated once, in `lib/`**

- [ ] `lib/legislation.ts` exports a single roll-call classifier with this exact
      contract and no other:

      ```ts
      export function categoryForRollCall(input: {
        question: string;
        billType: string | null;
      }): Category;
      ```

      Precedence, evaluated in this order and short-circuiting:
      1. question matches `/nomination/i` → `"nomination"`
      2. question matches `/amendment/i` **and not** `/concur/i` → `"amendment"`
      3. `billType` is non-null → `categoryForBillType(billType)`
      4. otherwise → `"motion"`

- [ ] `categoryForBillType(billType)` is unchanged and stays exported — it
      classifies a *bill*, and is still what the per-bill grouped card on `/bills`
      uses. It is never called on a roll call again.
- [ ] `categoryForQuestion` is **removed** from `lib/legislation.ts`. Folding it
      into `categoryForRollCall` is the point: while both are exported a call site
      can pick the wrong one, which is this bug. `grep -rn "categoryForQuestion" app components lib`
      returns nothing after the change.
- [ ] All three inline call sites collapse onto `categoryForRollCall`:
      `app/bills/page.tsx:61`, `app/page.tsx:41-42` (`toCardItem`), and
      `app/page.tsx:122-123` (`getPerformance`). No file outside `lib/` contains a
      `billType ? … : …` classification branch afterwards.
- [ ] The rule is chamber-agnostic: House and Senate amendment votes are classified
      by exactly the same predicate, with no `chamber` input and no per-chamber
      branch anywhere in the classifier.

**B. Result classification, stated once**

- [ ] `lib/legislation.ts` exports `resultKind(result: string): "passed" | "failed" | "other"`,
      evaluated in this order: `/confirm/i` → passed; `/reject|fail|not agreed|negatived|defeated/i`
      → failed; `/pass|agreed|adopt/i` → passed; otherwise `"other"`.
      `defeated` is new; `adopt` is carried over from `vote-status.tsx` so the two
      predicates can merge without losing a case (no result in the database
      contains "adopt" today, so this changes no row).
- [ ] `votePhase` delegates to `resultKind` and its observable mapping is unchanged
      except for `defeated`: `"passed"` → the existing Confirmed/Passed labels,
      `"failed"` → `{ label: "Failed", kind: "failed" }`, `"other"` →
      `{ label: result, kind: "progress" }`.
- [ ] `components/vote-status.tsx` `kindFor` is deleted and `VoteStatusBadge`
      delegates to `resultKind`, mapping `"other"` → its existing `neutral` style.
      The regex literals exist in exactly one file after this change.
- [ ] `billPhase` is untouched — its `PASSED` / `PASSAGE_Q` predicates and its
      output for every input are unchanged.
- [ ] The 8 `Bill Defeated` / `Joint Resolution Defeated` roll calls each render a
      red "Failed" badge on `/votes/[id]` (verify `senate-119-1-527` and
      `senate-119-1-225`). On `/bills` they have no badge of their own — each is
      bill-linked, so it sits inside its bill's grouped card, whose badge comes from
      `billPhase`, not `votePhase`; see the Resolution block for the three bills
      whose card badge is therefore not red. The 9 remaining `other` rows
      (`house-119-1-2`, `senate-119-1-273/274`, `senate-119-1-331`,
      `senate-119-1-330`, `senate-119-1-515`, `senate-119-1-524`,
      `senate-119-2-9`, `senate-119-2-108`) keep the gray badge showing their raw
      result text.

**C. `/bills` — amendment votes get their own cards**

- [ ] `getItems` partitions rows into three, in this order: a row whose
      `categoryForRollCall` is `"amendment"` becomes its own `LegItem`; otherwise a
      row with a `bill_id` joins that bill's group; otherwise it becomes its own
      `LegItem`. A row is in exactly one partition.
- [ ] An amendment `LegItem` has: `key` = `rc_id`; `href` = `/votes/${rc_id}`;
      `category` = `"amendment"`; `chambers` = `[row.chamber]`; `originChamber` =
      `row.chamber` (**the roll call's chamber, not the bill type's** — a Senate
      vote on an H.R. amendment is a Senate vote); `label` = the parent bill number
      (`${bill_type.toUpperCase()} ${bill_number}`) when `bill_id` is set, else the
      question with `^On the |^On ` stripped; `title` = the shared lead-text helper
      (criterion D1); `phase` = `votePhase(row.result)`.
- [ ] Amendment rows are excluded from their bill's group entirely, including from
      the `rollCalls` array passed to `billPhase`. Measured: this changes **no**
      bill card — 0 of 509 bills have an amendment vote as their most recent roll
      call, 0 change their `billPhase` passage detection, and 0 bills have only
      amendment roll calls, so no bill disappears from the Bills tab.
- [ ] `/bills` tab counts move from the left column to the right and nowhere else:

      | Tab | Before | After |
      |---|---|---|
      | All | 970 | 1158 |
      | Bills | 299 | 299 |
      | Resolutions | 210 | 210 |
      | Nominations | 221 | 221 |
      | Motions | 240 | 240 |
      | **Amendments** | **0** | **188** |

      188 = 90 House (89 "On Agreeing to the Amendment" + 1 "…, as Modified") +
      98 Senate ("On the Amendment").
- [ ] The 6 House "Motion to Concur in the Senate Amendment(s)" roll calls
      (including the one under suspension of the rules) stay grouped with their
      parent bill and are **not** in the Amendments tab — the `/concur/i` exclusion
      in the precedence rule. Verified by the counts above: Bills stays at 299 and
      Resolutions at 210.

**D. Display hierarchy — amendment votes lead with the amendment**

- [ ] **D1.** `lib/legislation.ts` exports the lead-text rule once:

      ```ts
      export function leadTextFor(input: {
        question: string;
        billType: string | null;
        billTitle: string | null;
        description: string | null;
      }): string;
      ```

      - when `categoryForRollCall(input) === "amendment"`:
        `description ?? billTitle ?? question`
      - otherwise (unchanged from slice 1): `billTitle ?? description ?? question`

      An amendment vote is identified for display by exactly the same rule that
      classifies it — there is no second definition of "is an amendment".
- [ ] **No-description case:** when an amendment vote has `description === null`
      the function returns `billTitle`, i.e. precisely what the page renders today.
      No placeholder, no "Amendment", no empty element. (Zero rows are in this state
      right now — all 188 have a description — but House `vote-desc` /
      `amendment-author` can both be empty, so the fallback must exist and must be
      unit-tested.)
- [ ] **Non-amendment votes are untouched.** For every roll call whose category is
      not `"amendment"`, `leadTextFor` returns exactly `billTitle ?? description ??
      question`. Measured: 1,385 of 1,573 roll calls render identical lead text
      before and after; the 188 that change are exactly the amendment votes.
- [ ] All four surfaces that already share the slice-1 chain call `leadTextFor` and
      none spells the chain inline: `app/votes/[id]/page.tsx` (`fullTitle` and
      `generateMetadata`'s `subject` — both, so `<title>` and `<h1>` cannot
      disagree), `app/page.tsx` (`toCardItem`), `app/bills/page.tsx` (the amendment
      card), `app/members/[id]/page.tsx` (`subject` in the recent-votes list).
      `getRecentPositions` and `getRollCall` gain `b.bill_type` in their SELECT so
      the helper can be called; no other query column is added or removed.
- [ ] **D2. Parent bill beneath as context.** On `/votes/[id]`, when the roll call's
      category is `"amendment"` and `rc.bill_id` is non-null, a context line renders
      directly below the existing secondary question line, reading
      `Amendment to {BILL NUMBER} · {bill title}` (e.g. "Amendment to HR 4553 ·
      Energy and Water Development and Related Agencies Appropriations Act, 2026").
      It is plain text in the same muted style as the question line, not a link —
      there is no bill page in this app, and the existing "Other votes on this bill"
      section already provides navigation to the bill's other roll calls.
- [ ] The context line renders on no other page and for no other category. When the
      lead text fell back to `billTitle` (no description), the context line is
      suppressed rather than repeating the title immediately under itself.
- [ ] The header row (chamber pill, `billNumber` mono badge, date), the
      `ExpandableTitle` component, the scoreboard, the party table, the "Other votes
      on this bill" section and its heading, and the roster are all unchanged. No
      new component, no Tailwind token change, no layout rework — Phase B owns the
      redesign.
- [ ] Verified in a preview on `senate-119-1-366` (Senate, purpose sentence leads,
      H.R. 1 beneath), `house-119-1-231` (House, "Perry of Pennsylvania Amendment
      No. 27" leads, H.R. 4553 beneath), and any `hr-1-119` passage vote (unchanged
      — bill title still leads, no context line).

**E. The breakdown table sums**

- [ ] `CatStats` in `components/chamber-breakdown.tsx` gains `other: number`;
      `emptyPerformance()` in `app/page.tsx` initialises it; `getPerformance`
      increments it from `resultKind(r.result) === "other"`.
- [ ] `PerformanceTable` renders a fourth numeric column, "Other", in muted gray,
      in every category row and in the totals row. The invariant
      `votedOn === passed + failed + other` holds for **every cell of both chamber
      tabs and both totals rows**.
- [ ] House tab, after:

      | Type | Voted on | Passed | Failed | Other |
      |---|---|---|---|---|
      | Bills | 361 | 285 | 76 | 0 |
      | Resolutions | 218 | 198 | 20 | 0 |
      | Nominations | 0 | 0 | 0 | 0 |
      | Motions | 7 | 3 | 3 | 1 |
      | Amendments | 90 | 27 | 63 | 0 |
      | **Total** | **676** | **513** | **162** | **1** |

      (before: Bills 448/310/138, Resolutions 221/200/21, Motions 7/3/3,
      Amendments 0/0/0, Total 676/513/162 — which did not sum)
- [ ] Senate tab, after:

      | Type | Voted on | Passed | Failed | Other |
      |---|---|---|---|---|
      | Bills | 176 | 68 | 106 | 2 |
      | Resolutions | 169 | 86 | 78 | 5 |
      | Nominations | 221 | 221 | 0 | 0 |
      | Motions | 233 | 231 | 1 | 1 |
      | Amendments | 98 | 15 | 83 | 0 |
      | **Total** | **897** | **621** | **268** | **8** |

      (before: Bills 233/79/148, Resolutions 210/90/111, Nominations 221/221/0,
      Motions 233/231/1, Amendments 0/0/0, Total 897/621/260 — which did not sum.
      The Senate failed count rises 260 → 268 because `defeated` now matches.)
- [ ] `votedOn` per chamber is unchanged in total (House 676, Senate 897) — this
      slice moves votes between categories and adds a column; it never drops or
      double-counts a roll call. `getPerformance` still reads every row of
      `roll_calls` exactly once.

**F. Unit tests (`lib/legislation.test.ts`)**

- [ ] The `categoryForQuestion` describe block is replaced by a `categoryForRollCall`
      block covering, at minimum:
      1. amendment question **with** a bill id — `{ question: "On the Amendment", billType: "s" }` → `"amendment"` (the headline bug)
      2. House form — `{ question: "On Agreeing to the Amendment", billType: "hr" }` → `"amendment"`
      3. plain bill vote — `{ question: "On Passage", billType: "hr" }` → `"bill"`; `{ question: "On Passage of the Bill", billType: "sjres" }` → `"resolution"`
      4. nomination — `{ question: "On the Nomination", billType: null }` → `"nomination"`
      5. cloture motion — `{ question: "On the Cloture Motion", billType: null }` → `"motion"`; and `{ question: "On the Cloture Motion", billType: "s" }` → `"bill"` (a bill-linked procedural vote still belongs to its bill)
      6. concur exclusion — `{ question: "On Motion to Concur in the Senate Amendment", billType: "hr" }` → `"bill"`
      7. no bill, no keyword — `{ question: "Election of the Speaker", billType: null }` → `"motion"`
- [ ] A `resultKind` block asserts: `"Nomination Confirmed"` → passed;
      `"Bill Defeated"` / `"Joint Resolution Defeated"` → failed (the regression
      this fixes); `"Amendment Rejected"` / `"Motion to Table Failed"` → failed;
      `"Cloture Motion Agreed to"` / `"Passed"` → passed;
      `"Point of Order Sustained"` / `"Decision of Chair Not Sustained"` /
      `"Johnson (LA)"` → `"other"`.
- [ ] A `leadTextFor` block asserts, at minimum: an amendment vote with both a
      description and a bill title returns the description; an amendment vote with
      `description: null` returns the bill title; an amendment vote with both null
      returns the question; a bill vote with both returns the bill title (**not**
      the description); and a bill-less nomination with a description returns the
      description.
- [ ] `npm test` reports **more** than the current 88 passing tests across 7 files,
      and every pre-existing test outside the deleted `categoryForQuestion` block
      passes unmodified.

**G. No regression**

- [ ] **`/bills` filtering:** the chamber `<select>` still filters on
      `it.chambers`; every amendment card carries its own chamber, so
      House-filtered and Senate-filtered counts are 90 and 98 in the Amendments tab
      and the "N results" line matches the rendered card count in all 18
      tab × chamber combinations.
- [ ] **`/bills` search:** `components/bills-browser.tsx` is unchanged. Searching
      still matches `label + title` case-insensitively. Searching a bill's name
      (e.g. "Energy and Water") still returns that bill's card; it does **not**
      return that bill's amendment cards, whose titles are amendment text — this is
      not a regression, because those roll calls had no card of their own before.
      Searching "HR 4553" returns the bill card and its amendment cards together.
- [ ] **Homepage carousel:** `getRecentVotes` still `LIMIT 10`, still ordered by
      `vote_date DESC, roll_number DESC`, and the `label` rule is unchanged (bill
      number when linked, else the stripped question) — so a linked amendment vote's
      label stays the bill number. Only `category` (now "Amendment" where it said
      "Bill") and `title` (now the amendment text) change, and only for amendment
      votes.
- [ ] **`getPerformance`:** one query, one pass, no new round trip; `/` and
      `/bills` keep `export const dynamic = "force-dynamic"` and
      `/votes/[id]` keeps `revalidate = 3600` with its **empty**
      `generateStaticParams()`. Caching is slice 7.
- [ ] **`/members/[id]`:** the recent-votes list keeps its shape — the sub-line
      still renders `question · result · date` whenever the lead text differs from
      the question. For an amendment vote the lead text is now the amendment and the
      question still appears beneath; no row loses its question.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` passes.
- [ ] Lands on a feature branch via PR against protected `main`, verified visually
      in the preview on: `/bills` with the Amendments tab selected, the homepage
      House **and** Senate breakdown tabs (check all four rows sum), the carousel,
      and the three vote pages named in criterion D2.

### Scope

**In**

- `lib/legislation.ts`: add `categoryForRollCall`, `resultKind`, `leadTextFor`;
  remove `categoryForQuestion`; `votePhase` delegates to `resultKind` and gains
  `defeated`.
- Collapsing the three inline classification branches onto `categoryForRollCall`.
- `components/vote-status.tsx`: delete the duplicate `kindFor` regex, delegate.
- `app/bills/page.tsx`: three-way partition; amendment roll calls become their own
  cards.
- `app/page.tsx`: `toCardItem`, `getPerformance`, `emptyPerformance` — new
  classifier, new `other` bucket.
- `components/chamber-breakdown.tsx`: `CatStats.other` + one "Other" column.
- `app/votes/[id]/page.tsx`: `leadTextFor` for `fullTitle` and `generateMetadata`;
  the parent-bill context line; `b.bill_type` added to `getRollCall`.
- `app/members/[id]/page.tsx`: `leadTextFor` for `subject`; `b.bill_type` added to
  `getRecentPositions`.
- New unit tests in `lib/legislation.test.ts`.

**Out** — named so they do not get pulled in

- **No database write of any kind.** No migration, no schema change, no re-sync, no
  ingest change. This slice is presentation logic over the data slice 1 already
  stored. `scripts/` and `db/` are not touched.
- The multi-Congress schema rework — slice 13. Do not touch `db/schema.ts`.
- Self-verifying ingest / tally assertions — slice 3. `result_text` carries the
  published tally and this slice **stores and renders nothing new from it**;
  `roll_calls.result` still drives every badge and every count.
- Re-enabling the cron and the "data current as of" UI — slice 4.
- Bill `summary` / `short_title` — slice 5. When `short_title` joins the lead-text
  chain it changes in `leadTextFor` and nowhere else; that is the point of
  centralising it now.
- `pg_trgm` and search rewriting — slice 6. `bills-browser.tsx` filtering is
  untouched.
- Any caching change (`force-dynamic`, `revalidate`, ISR) — slice 7.
- Any visual redesign, new component, Tailwind token, or palette change — Phase B.
  The one "Other" column and the one context line are arithmetic and hierarchy
  fixes the epic authorised, not design work.
- A bill detail page. `/bills` still routes a bill card to its latest roll call.
- Enriching House amendment text beyond what the XML gives (see decision 3).
- `lib/ids.ts`, `lib/votes.ts`, `lib/format.ts` — no changes.

**Decisions made here, not open**

1. **"Motion to Concur in the Senate Amendment" is not an amendment vote.** Six
   House roll calls match `%amendment%` but are motions disposing of the *bill* as
   the Senate amended it — the most consequential vote on that bill. Filing them
   under Amendments would pull them out of their bill's card. The `/concur/i`
   exclusion keeps them with the bill. It is the only exception, and no other
   question in the database contains both a motion word and "amendment".
2. **The breakdown table gets an "Other" column rather than a fudged total.** Nine
   roll calls are honestly neither passed nor failed — a Speaker election, four
   points of order, four rulings of the chair. The epic authorised "make the table's
   own arithmetic honest"; a fourth column is the smallest change that does it, and
   it survives Phase B's redesign as data rather than layout.
3. **House amendment `description` is the sponsor and number, not the purpose.**
   Slice 1 sourced it from `<amendment-author>` because `<vote-desc>` is empty on
   House amendment votes, so all 90 House amendment leads will read like "Perry of
   Pennsylvania Amendment No. 27". That is still a strict improvement — today
   fifteen different Perry amendments to H.R. 4553 all headline the same bill title
   and are indistinguishable — but it is *why* the parent-bill context line (D2) is
   required rather than decorative. The Senate's 98 descriptions are genuine purpose
   sentences ("To strike the appropriations for the Office of Management and
   Budget."). Enriching House amendment text from another source is out of scope.
4. **House and Senate amendment votes are treated identically.** One predicate, no
   chamber branch, at every layer — classification, card shape, lead text, context
   line. The only chamber-shaped difference is the quality of the source text
   (decision 3), which is a data fact, not a rule.
5. **`categoryForQuestion` is deleted rather than kept alongside.** Two exported
   classifiers with overlapping domains is the bug's root cause; leaving both
   invites the next call site to re-introduce it.

### Relevant files

- `/Users/ryanhayes/claude_code/hidden-figures/lib/legislation.ts` — the whole rule
  lives here. `categoryForBillType` / `categoryForQuestion` (~line 26–35),
  `votePhase` (~line 73), the `PASSED` / `FAILED` regexes (~line 41–43).
- `/Users/ryanhayes/claude_code/hidden-figures/lib/legislation.test.ts` — the only
  place the contract is provable; 88 tests pass repo-wide today.
- `/Users/ryanhayes/claude_code/hidden-figures/app/bills/page.tsx` — `getItems`
  (~line 36); the bill-less branch (~line 61) and the grouped-bill branch (~line 85)
  are the two halves of the wrong choice.
- `/Users/ryanhayes/claude_code/hidden-figures/app/page.tsx` — `toCardItem`
  (~line 38, branch at 41–42), `emptyPerformance` (~line 96), `getPerformance`
  (~line 103, branch at 121–123).
- `/Users/ryanhayes/claude_code/hidden-figures/components/chamber-breakdown.tsx` —
  `CatStats` (~line 6) and `PerformanceTable` (~line 30). A `"use client"` module:
  types and presentation only, the counting stays in `app/page.tsx` and `lib/`.
- `/Users/ryanhayes/claude_code/hidden-figures/components/vote-status.tsx` —
  `kindFor` (~line 5), the duplicate pass/fail regex.
- `/Users/ryanhayes/claude_code/hidden-figures/app/votes/[id]/page.tsx` —
  `getRollCall` (~line 27), `generateMetadata`'s `subject` (~line 99), `fullTitle`
  (~line 125), the secondary question `<p>` (~line 145), "Other votes on this bill"
  (~line 230).
- `/Users/ryanhayes/claude_code/hidden-figures/app/members/[id]/page.tsx` —
  `getRecentPositions` (~line 84) and `subject` (~line 238).
- `/Users/ryanhayes/claude_code/hidden-figures/components/bills-browser.tsx` —
  tabs, counts and the `label + title` search. **Read it; do not change it.** It is
  `"use client"`, so nothing shared may be defined in it.
- `/Users/ryanhayes/claude_code/hidden-figures/components/leg-card.tsx` — renders
  `LegCardItem`; unchanged, but shows how `label` / `category` / `title` read on a
  card.
- `/Users/ryanhayes/claude_code/hidden-figures/.claude/specs/slice-01-readable-vote-descriptions.md`
  — the lead-text chain this slice modifies, and the accepted trade that created
  the 194 rows.
- `/Users/ryanhayes/claude_code/hidden-figures/CLAUDE.md` — the `lib/`-purity
  convention, the no-query-layer convention, the rendering-strategy rules, and the
  Next 16 warning in `AGENTS.md`.

### Open questions

**Q1 — Should the 188 new amendment cards appear in the `/bills` "All" tab, or only
under Amendments?** The All tab grows 970 → 1158, and ~90 of the new cards are
House amendment-author strings ("Boebert of Colorado Part A Amendment No. 3") that
read as noise next to bill titles; H.R. 8800 alone contributes a run of them on one
date. Including them is defensible — they are real recorded votes and "All" should
mean all — and excluding them would make the tab counts stop summing, which is the
exact dishonesty criterion E is fixing on the other table.

Recommendation: **include them** (what the criteria above assume). Flagging it
because 188 cards is a visible change to the default view of a browse page and the
owner may prefer Amendments to be opt-in. If the answer is "exclude", only the "All
= 1158" figure in criterion C changes; nothing else in the spec moves, so
implementation is not blocked.

Everything else in the epic's three problems is resolved against the live data and
recorded above as a decision.

---

## Resolution (orchestrator, 2026-09-24)

**Q1 → yes.** The 188 amendment cards stay in the `/bills` "All" tab; "All" means all. The
`All = 1158` figure in the acceptance criteria stands as written. No other number changes.

**The 8 `Defeated` roll calls on `/bills`.** Criterion B's last bullet scopes the red "Failed"
badge to `/votes/[id]`, where it holds for all 8. On `/bills` all 8 are bill-linked and so carry
no badge of their own — the grouped bill card's badge is `billPhase`, which criterion B leaves
untouched. Measured against the live data: 4 of them sit on cards that do read red "Failed"
(`s-2882-119` ×2, `sjres-71-119`, `sjres-10-119`), and 4 sit on three bills that do not —

| Bill | Card badge | Roll calls | Why |
|---|---|---|---|
| `hr-5371-119` | Became law | `senate-119-1-528`, `senate-119-1-535` | `billPhase` short-circuits on `status` = "Became Public Law No: 119-37" before it reads a single roll call |
| `sjres-49-119` | Advanced | `senate-119-1-225` | `senate-119-1-226` ("Motion to Table Agreed to") is a passing result, but "On the Motion to Table" is not a `PASSAGE_Q` question, so the card lands on "Advanced" |
| `sjres-82-119` | Advanced | `senate-119-1-654` | same shape via `senate-119-1-641` ("Motion to Proceed Agreed to") |

This is correct, not a defect: a bill card reports the *bill's* phase, not one roll call's, and a
bill that became law is not "Failed" because 2 of its 26 roll calls were. Criterion B's
`billPhase`-untouched rule takes precedence — do **not** "fix" `billPhase` to make a red badge
appear on these three cards.
