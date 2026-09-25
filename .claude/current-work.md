# Hidden Figures — Make the current Congress genuinely useful, then open it to history

Status: in-progress
Updated: 2026-09-24
Signed off: 2026-09-18

## Goal

Two outcomes, in this order.

**First:** someone lands on the site and can actually answer "what is Congress voting on, and how did my member vote?" Today they half-can — the data is three months stale, 41% of roll calls display as "On the Nomination" with no nominee named, and every bill page shows an official title with no explanation of what the bill does.

**Then:** the same experience for the 117th and 118th Congresses, on a data model where adding another Congress is a data load rather than a rewrite.

Success is concrete: every roll call says in plain English what was being voted on; the site is never more than a day stale and says how fresh it is; search tolerates a typo; and a member's profile shows their record *in a given Congress*, with the right party and seat for that Congress.

## Stack & setup

Observed from the repo — all of this already exists and works.

- **Web:** Next.js 16.2.9 (App Router) + React 19.2.4, Tailwind v4, deployed on Vercel. Push to `main` = production; every PR gets a preview URL.
- **DB:** Postgres on Neon, 65 MB. Drizzle ORM + drizzle-kit migrations (`db/schema.ts` → `drizzle/`). No local Postgres — dev runs against live Neon.
- **Ingestion:** TypeScript under `scripts/`, run via `tsx`, scheduled by `.github/workflows/sync.yml`. Pure parsers live in `lib/` and are the only unit-tested layer.
- **Tests:** Vitest 4.1.8, no config file. 7 files, 47 tests, all passing as of 2026-09-18.
- **Runtime:** Node 22 (`.nvmrc` + `engines`). Non-interactive shells may need
  `export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"`.
- **Env:** `.env` (gitignored) holds `CONGRESS_GOV_API_KEY` and `DATABASE_URL`. Same two are GitHub Actions secrets and Vercel project env vars. **The repo is public.**

```bash
npm run dev                                                      # localhost:3000 against live Neon
npm run lint && npm run typecheck && npm test && npm run build   # the CI gate
npx vitest run lib/votes.test.ts                                 # one test file
npm run sync:votes -- 400                                        # catch-up ingest
npm run db:generate && npm run db:migrate                        # schema change
```

CI on every PR: lint → typecheck → test → build. `main` is protected; branch-per-feature → PR → merge.

## Decisions

- **Sequence: ingest fixes → schema → UI polish.** The data-quality wins live in `scripts/` and `lib/votes.ts`, which the multi-Congress migration barely touches. Doing them first means they ship soon; doing UI polish first would mean rewriting every page query when the schema lands.
- **History scope: 117th–119th (2021–present).** ~129 MB, inside Neon's free tier, and every roll call links to a bill with a real title. Going back to 1973 was considered and deferred — the architecture makes it a re-run of one script, not a rewrite. Pre-1973 is rejected outright: a 78-year stretch has votes with no linkable legislation.
- **No launch date.** Ordering is value-first. The 120th Congress (seated 3 Jan 2027) is explicitly a **separate future epic** — the multi-Congress schema in this epic is what makes it a data load instead of a crisis.
- **Member stats are per-Congress and labelled as such.** "In the 118th, voted with party 94% of the time." Career totals are misleading with only three Congresses loaded; revisit when the archive is deep.
- **Ingest verifies itself against *parsed* positions, not stored ones.** The chambers' published tally matches our parsed positions on 1,572 of 1,572 roll calls, measured — so that assertion is exact. Positions are lost *after* parsing, at the LIS crosswalk and the roster filter, and that loss is handled by attribution: every dropped position carries a member id and a reason, and an unattributed residual is fatal. Be precise about what that buys: as wired, every drop path pushes exactly one skip, so the residual is identically 0 for all inputs — it is a **tripwire against a future edit** that adds a drop path and forgets the skip, not a detector of production drift. The checks that actually respond to live data are tally verification and reconciliation shortfall (both exit 2), and the budget/surplus/no-tally warnings (exit 0). Measured loss is **4,902 positions (1.28%)**, not the ~3,300 the epic originally cited — and 4,093 of them are House, not Senate.
- **Source of record: official XML for 118–119, Voteview for 117.** A `source` column on `roll_calls` records which. Recent data — the data people care most about — comes from the primary record; Voteview avoids thousands of rate-limited requests for bulk backfill.
- **Compute is the cost driver, not storage.** Neon meters compute at $0.106/CU-hour; the three-Congress scope is 129 MB against a 500 MB free tier. So the site caches against the nightly sync rather than querying per pageview. Considered and rejected: dropping Postgres for direct API calls cached in the browser — `clerk.house.gov` and `senate.gov` send no CORS headers, the sources are vote-major (one member's record is spread across 1,414 files / ~72 MB for the 119th alone), and neither offers search or aggregates. Static build-time JSON remains a viable future option if the DB ever costs anything.
- **Design tone: civic journalism.** Editorial and readable — strong typography, clear hierarchy, generous measure. Rejected: the current patriotic-civic look, a dense reference-terminal feel, and generic SaaS-product styling.
- **Brand palette goes neutral; red and blue are reserved for party.** Today the flag colors are simultaneously the brand and the party encoding, which muddies both. Party color keeps carrying meaning; the brand stops competing with it.
- **The redesign runs direction-spike-first.** One slice produces competing static mockups of the two pages that matter, you pick one, later slices apply it. No page gets designed twice.
- **Design the seams, build one Congress.** Phase B lays out pages so a Congress switcher and a "served in 117 · 118 · 119" strip can drop in without redesign, keeps every stat per-Congress-shaped, and avoids hardcoding "119th" in copy — but builds none of it.
- **Specs live in the repo, not GitHub Issues.** Each slice's spec is a file under `.claude/specs/`, versioned alongside this brief. The dev-team pipeline does not use `gh` or the GitHub MCP server.
- **Agents run production migrations and re-syncs themselves.** No staging database exists. Migrations here are additive and nullable; syncs are idempotent upserts identical to what the nightly cron does. The owner is told what ran, not asked each time.
- **The design spike runs in parallel with the rest of Phase A.** Slice 8 produces mockups, not shipped code, and depends on nothing left in Phase A. The homepage redesign (slice 11) genuinely does collide with slices 2, 4 and 6, so it waits.
- **Cron stays off until ingest verifies itself.** Slice 3 before slice 4, deliberately: an unattended nightly job writing unverified data to production is what tally assertions exist to prevent. The cost is accepted — the site drifts about a week per week until then.
- **An amendment vote page leads with the amendment.** Headline the amendment's own purpose, with the parent bill beneath as context. The page is about the amendment, and slice 1 already fetched the text — it was just invisible behind the bill title on 193 pages.
- **Phase A runs without a per-slice spec gate.** The epic is signed off; each slice still gets its own branch, PR, QA pass and reviewer approval, and stops for genuine product decisions or outward-facing actions.
- **Analytics come last.** Of the saved-for-later ideas, attendance and the bipartisanship meter are in; "closest votes" is dropped for now. They're built per-Congress, after the foundation, so they aren't built twice.
- **State legislatures stay out.** The `jurisdictions` table is the seam; nothing else until a per-state coverage map exists.

## Out of scope

- The 120th Congress transition (separate epic, after this one).
- State legislators and anything OpenStates.
- Pre-117th Congresses — the backfill script is designed to take a Congress number, so this is later configuration, not later engineering.
- Full bill catalog (all bills, not just voted-on ones) via GovInfo BILLSTATUS.
- Custom domain, OG image cards, AI-generated vote summaries.
- Floor-schedule / upcoming-votes integration. The homepage currently advertises it; Phase B removes the promise rather than building it.
- A ground-up redesign of `/votes/[id]` and `/bills`. They inherit the new design system and the bill summaries, but aren't redesigned surfaces this epic.
- Moving off Neon's free tier. Storage was never the constraint; revisit when traffic demands always-on compute.

## Context

**Prior work:** `docs/expansion/` (8 docs, ~900 lines, dated 2026-09-05) is a measured expansion plan — verified endpoints, exact row counts, a proposed multi-Congress schema, and an 8-PR build sequence. This backlog follows it, reordered so the current-Congress fixes come first. **It is currently untracked — commit it.** `docs/PROJECT.md` is the standing brief but has drifted: it claims 5,000 req/hr on Congress.gov (measured: 20,000) and describes data as current.

**Measured state of the live DB (2026-09-18):** 530 legislators · 1,414 roll calls · 441 bills · 330,867 positions · 65 MB. No orphaned rows, no members with zero votes.

**The four problems this epic fixes, as found:**

1. **Stale.** Latest roll call is 2026-06-11 — the nightly cron has been paused since June (two commented lines in `sync.yml`). Roughly 220 roll calls missing.
2. **Illegible.** 577 of 1,414 roll calls have no linked bill and display only a bare question. House linkage is fine (577/584); the gap is Senate nominations (201), cloture motions (200), and amendments (97). **The fix is already in the XML we download and discard** — Senate `vote_document_text` ("Kevin Warsh, of Florida, to be Chairman of the Board of Governors…"), `vote_title`, `vote_result_text`, and `amendment_to_document_number` (links amendment votes to their parent bill); House `vote-desc` ("Make the District of Columbia Safe and Beautiful Act"). `lib/votes.ts` parses none of them.
3. **Empty bill context.** All 441 bills have `summary` and `short_title` NULL. The columns exist; the sync never fills them.
4. **Search is weaker than documented.** `pg_trgm` is **not installed** — `select count(*) from pg_extension where extname='pg_trgm'` returns 0 — despite README and PROJECT.md both claiming it. `app/api/search/members/route.ts` uses `ilike '%q%'`: substring only, no typo tolerance, no ranking, and no bill search at all.

**Architectural constraint on everything after Phase A:** `legislators` stores one party, one state, one district, one chamber per person. Those all vary across Congresses (party switchers, chamber movers, redistricting), so loading the 117th into today's schema renders history wrong silently, with no error. `db/schema.ts` and `docs/expansion/04` have the details. Also relevant: `vote_positions` uses text FKs at 179 bytes/row for ~10 bytes of information — trivial to fix at 331k rows, painful at 1.5M.

**Key files:** `lib/votes.ts` (chamber XML parsers), `lib/ids.ts` (the natural-key formats everything depends on), `scripts/sync-votes.ts` / `sync-members.ts`, `db/schema.ts`, `app/api/search/members/route.ts`. Page queries are written inline per route — there is no shared query layer, by choice.

## Backlog

**Phase A — data & correctness (current Congress)**

- [x] 1. Readable vote descriptions **(done 2026-09-24)** — parse the plain-English fields both chambers already publish; nominations name the nominee, amendments link to their parent bill; re-sync the 119th. Spec: `.claude/specs/slice-01-readable-vote-descriptions.md`
- [x] 2. Correct vote classification **(done 2026-09-24)** — **now 194 roll calls misfiled** (was 65; slice 1 linked ~129 more Senate amendment votes to parent bills). House amendment votes are filed as bills because they carry a bill id and `categoryForBillType` wins over `categoryForQuestion`; the House breakdown also reports 583 of 584 votes as passed-or-failed. Pure `lib/` logic, so it's provable by unit test. **Moved up from 6.** Also decide here: an amendment's own description is currently invisible on its vote page because `bills.title` wins the fallback — 193 roll calls affected.
- [x] 3. Self-verifying ingest **(done 2026-09-24)** — verify parsed positions against each chamber's published tally; attribute every dropped position to a member id; fatal on an unattributed residual.
- [x] 4. Fresh data **(done 2026-09-25)** — spec: `.claude/specs/slice-04-fresh-data.md` — re-enable the nightly cron and show "data current as of" in the UI. **Three hard requirements carried from slice 3's review, because this is the slice that makes the sync unattended:** (a) close the remaining two empty-but-green paths — `fetchHouseVotes` returns empty after a bare `console.warn` when the House roll probe fails, and a Senate menu returning HTTP 200 with an empty vote list produces *no* warning at all, not even a `console.warn`, with the step summary reading `senate vote menu | ok`; both are structurally identical to the two paths slice 3 fixed; (b) add a roster-size floor before acting on `legislators-current.yaml` in **both** `sync-members.ts` (whose `notInArray` would mass-retire sitting members from a truncated-but-valid parse) and `sync-votes.ts`'s `loadRoster` (where a truncated roster makes every Senate position `no-crosswalk` — attributed, so it only warns, and the nightly quietly stops storing Senate positions); (c) verify the cron's first real run end to end rather than assuming.
- [ ] 5. Bill summaries — populate `summary` and `short_title` from Congress.gov (0 of 509 bills have either today); surface them on bill and vote pages. **Two carried-over notes:** the `bill_title ?? description ?? question` chain is spelled in five places and they must all change together when `short_title` joins it, or `<title>` and `<h1>` will disagree; and if this slice passes a *computed* budget to `truncate`, add the `max <= 0` guard it currently lacks.
- [ ] 6. Real search — install `pg_trgm`, index members and bills, fuzzy + ranked; extend search to bills; correct the docs.
- [ ] 7. Cache against the nightly sync — also truncate description text in the `/bills` query (~200 KB of nominee lists now flow into a page that renders all 1,573 cards). Drop `force-dynamic` from `/`, `/members`, `/bills` and the party pages; revalidate on ingest instead of per request, so the DB is hit on a cache miss rather than on a pageview. Last in Phase A so we aren't caching data we're still fixing.

**Phase B — design & product polish (119th only)**

- [ ] 8. **[gate]** Design direction spike — 2–3 static mockups of the homepage and member profile in competing civic-journalism directions, each with a neutral brand palette and red/blue reserved for party. Output is a decision, not shipped code.
- [ ] 9. Design foundations — implement the chosen direction as Tailwind theme tokens, a type scale, and the shared components (badges, cards, tables, filters). Replaces the current `flag-*` tokens.
- [ ] 10. **[big]** Member profile redesign — the page the MVP goal names. Readable vote history (depends on 1), stats on one honest time scale, a real answer to "what does this person vote on?" beyond reverse chronology. Reserve the slot for a "served in" strip without building it.
- [ ] 11. Homepage & navigation redesign — hero, stats, carousel, breakdown table; cut the "floor-schedule integration is coming" promise; fix the hero search input that truncates its own placeholder; reserve a slot for the Congress switcher.
- [ ] 12. Mobile & responsive pass — most people checking how their rep voted will do it on a phone.

**Phase C — multi-Congress foundation**

- [ ] 13. **[big]** Multi-Congress schema — `jurisdictions`, `congresses`, `legislator_terms`, `member_congress_stats`; integer PKs with slugs preserved so no public URL changes. Neon branch first; exact row counts must survive.
- [ ] 14. Historical roster — ingest `legislators-historical`, one term row per person-per-Congress; recovers the 4,902 dropped positions (measured 2026-09-24; 4,093 of them House).
- [ ] 15. **[big]** Voteview backfill of the 117th — bulk `COPY` via an ICPSR→bioguide crosswalk; populate `member_congress_stats`. Checkpoint here and look at the data before any UI work.
- [ ] 16. Historical bill metadata — titles and summaries for bills referenced by newly loaded roll calls.

**Phase D — Congress-aware product**

- [ ] 17. Congress-aware data layer — thread a Congress through every query; party/state/chamber read from `legislator_terms`. No UI change, so tests alone can prove it.
- [ ] 18. **[big]** Congress routes and switcher — `/congress`, `/congress/[number]/…`; current Congress stays the unprefixed front door; all existing URLs keep resolving. Slots into the space Phase B reserved.
- [ ] 19. Time-aware member profile — "served in" strip, per-Congress stats, correct party and seat for the Congress being viewed.
- [ ] 20. Coverage disclosure — state plainly on `/about` and `/congress` what is and isn't covered; cite Voteview; bring `docs/PROJECT.md` back in sync.

**Phase E — analytics**

- [ ] 21. Attendance / most-absent leaderboard, per-Congress.
- [ ] 22. Bipartisanship meter, per-Congress, with the cross-Congress trend.

## Now

Slices 1–4 merged. **Next: slice 5 (bill summaries).** Then 6, 7. Phase B follows.

**Three things the cron needs a human for:**
- **E4 — unverified.** A scheduled run only fires on the default branch, so the cron itself is proven only by `workflow_dispatch` (three real runs: two green, one deliberately red). Confirm a `schedule`-triggered run appears after 06:17 UTC on 2026-09-26.
- **O1 — unverified.** Nobody has confirmed a failure email actually arrives. Run 36190962296 failed for real on 2026-09-25; if no email landed, the notification path needs escalating (an issue-on-failure step, or a webhook needing an owner-created secret).
- **O2 — standing.** GitHub disables scheduled workflows after 60 days of repository inactivity. A quiet stretch silently stops the nightly; the stale footer is the backstop that catches it.

**Production `sync_runs` has four rows that aren't real CI runs** (ids 1, 7, 8, 9) and nobody should read them as history: id 1 is hand-inserted test data (start and finish share an identical millisecond fraction, exactly 6000ms apart); id 7 is a local `npm run sync:votes` against production from a laptop; ids 8 and 9 were written accidentally by a QA harness whose module mock resolved to the wrong path. **The footer currently reads id 9, one of the accidental ones** — it self-corrects at the next genuine sync, and the 48-hour stale alarm is unaffected in substance. No data table was touched. Deleting them is a production write and the owner's call.

## Carried findings (raised in review, deliberately not fixed yet)

From slice 2's review. None blocks anything; each names where it should land.

- **`billPhase` misreads joint resolutions.** `PASSAGE_Q` doesn't match `"On the Joint Resolution"` (31 live rows) or `"On the Resolution"` (5), and `PASSED` doesn't know `Defeated` — so a joint resolution that actually passed, or was defeated, can only reach "Advanced". Correctness bug on `/bills` badges. **Worth fixing before Phase B**, so the redesign isn't built on wrong badges.
- **A bill whose only roll calls are amendment votes loses its Bills-tab card.** Zero bills today, but reachable as soon as the cron lands a bill mid-amendment-series (15 amendment votes on day 1, passage on day 3). Becomes live with slice 4.
- **A tabling motion on an amendment would classify as an amendment and take a green badge.** "On the Motion to Table the Amendment" matches the amendment predicate, and `votePhase("Motion to Table Agreed to")` reads Passed — so a killed amendment would render as a successful one. Zero such rows today; arrives via `sync:votes`, not via a code change.
- **`resultKind` now tests `/confirm/i` before the failure predicate**, inverting the old order. A string carrying both — "Confirmation Rejected" — would read passed where it once read failed. No such row today.
- **`sync-members.ts` silently nulls sponsorship counts on any Congress.gov failure**, and that job is now unattended. `fetchSponsorship` swallows every 4xx/5xx/network error and returns nulls; the upsert's `set` then writes NULL over the stored value, so one bad night removes "Bills sponsored" from every member profile — exit 0, green job, no annotation, recovering only on the next good night. Note the asymmetry: `sync-votes.ts` treats a missing API key as fatal. Same empty-but-green class the cron work was chartered to close.
- **The roster floor bounds the wrong variable by one step.** It checks the parsed YAML length, but the destructive `notInArray` update is bounded by the *mapped-row* length — and `notInArray(col, [])` compiles to `sql\`true\``, i.e. an unpredicated `UPDATE legislators SET in_office = false`. Hardening rather than a live hole: no upstream shape empties the mapped rows without `toLegislatorRow` throwing first. Closes for one line — re-run the same floor against `rows.length` immediately before the update.
- **`formatDate` consumes a DB-derived value outside the try/catch**, in the root layout, with no `error.tsx` or `global-error.tsx` anywhere — so a throw there is a 500 on every route. Safe only because drizzle's node-postgres driver overrides the DATE type parser to return raw strings; raw `pg` would hand back a `Date`. The repo is inconsistent about the `::text` cast (`app/bills/page.tsx` uses it). → slice 7 or Phase B.
- **`components/chamber-breakdown.tsx` is a 5-column `w-full` table with no `overflow-x` wrapper** — unverified at 320px. → Phase B mobile pass (slice 12).
- **`/bills` sorts by date only**, and stable sort puts solo cards above grouped ones, so an amendment sorts above the bill it amends on a shared date. → Phase B.

## Notes for next session

- **Slice 1 must land before slice 10.** Chuck Grassley's profile today shows nine of twelve recent votes as "On the Cloture Motion" / "On the Nomination". Redesigning the member profile before the vote text is readable would be designing around empty rows. Slice 10 also wants slice 4's bill summaries.
- **Slice 8 is a decision gate, not a build.** It ends with Ryan picking a direction; nothing ships from it.
- Slices 10, 13, 15 and 18 are the big ones — start each in a fresh session.
- **Take a Neon branch before slice 13.** Free, instant, and it's the only thing standing between a bad migration and the working 119th data.
- Slices 1–7 are data-layer and survive the schema change almost untouched. Slice 6's search query needs a small rewrite after slice 13 — accepted deliberately, because leaving search broken through all of Phase C costs more.
- Phase B's per-Congress framing is already a live problem, not a future one: the profile shows lifetime sponsorship counts (Grassley: 2,467 sponsored) beside 119th-only vote counts, with a footnote covering only the votes.
- `senate.gov` 403s under aggressive fetching. The existing sync batches 5 at a time with pauses; on failures wait 5–10 minutes and re-run (everything is idempotent).
- Congress.gov measures at 20,000 req/hr, not the 5,000 that `PROJECT.md` used to claim. Don't plan around the wrong number.
- Do not use the ProPublica API (shut down), and don't expect Senate roll-call positions from the Congress.gov API — they exist only in the chamber XML.
