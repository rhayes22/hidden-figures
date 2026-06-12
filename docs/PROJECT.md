# Hidden Figures — Project Brief & Handoff

This document is the single source of truth for the Hidden Figures project. It is
written to bring a new collaborator (human or AI assistant) fully up to speed so
they can continue the work. If you are seeding a claude.ai Project, this file is
the knowledge document to start from.

- **Repo:** https://github.com/rhayes22/hidden-figures (public)
- **Owner:** Ryan Hayes
- **Status:** Federal MVP feature-complete and deployed on Vercel; iterating on UI/features.
- **Last updated:** 2026-06-12

---

## 1. What this is

A public website where anyone can search any member of the U.S. Congress and see
how they voted, and search any bill/vote to see the full yea/nay roster broken
down by party. Independent and nonpartisan; built entirely on official public
records.

**Core user stories**
- Search a member by name → their profile with recent votes and voting stats.
- Search a bill/vote by number or title → full roll-call roster with party breakdown.
- Browse everything Congress voted on, filterable by type and chamber.
- Data refreshes automatically (nightly) — no manual updates. *(currently paused, see §7)*

## 2. Vision & scope

**Long-term vision:** the voting record of *every American politician*, searchable.
That breaks into three tiers with very different data availability:

| Tier | Who | Count | Data | Plan |
| --- | --- | --- | --- | --- |
| Federal | U.S. House + Senate | ~535 | Excellent (free official APIs) | **The MVP — current focus** |
| State | State legislators | ~7,400 | Good (OpenStates API) | Post-MVP |
| Local | Mayors, councils, school boards | ~500k | No centralized data exists | Out of scope |

**Current MVP scope:** the 535 voting members of the current **119th Congress**
(435 House + 100 Senate). Historical Congresses, former members, and state/local
are deliberately out of the MVP.

## 3. Tech stack

- **Web:** Next.js 16 (App Router) on Vercel. ⚠️ Next 16 has breaking changes vs.
  older versions — read `node_modules/next/dist/docs/` before writing Next code
  (the repo's `AGENTS.md` enforces this).
- **Database:** Postgres on **Neon** (hosted; no local Postgres needed).
- **ORM/migrations:** Drizzle (`db/schema.ts`, `npm run db:generate` / `db:migrate`).
- **Ingestion:** Node/TypeScript scripts run via `tsx` (`scripts/`), scheduled by a
  GitHub Actions cron.
- **Styling:** Tailwind CSS v4. Theme = "Old Glory" flag colors: `--color-flag-blue`
  `#0a3161`, `--color-flag-red` `#b31942` (defined in `app/globals.css`).
- **Quality:** Vitest (unit tests), ESLint, TypeScript strict. GitHub Actions CI runs
  lint → typecheck → test → build on every PR.
- **Runtime:** Node 22 (pinned via `.nvmrc` + `engines`).
- **Analytics:** Vercel Analytics.

## 4. Data model (4 Postgres tables)

```
legislators
  id (bioguide_id, PK), full_name, party, state, district (null for senators),
  chamber (house|senate), in_office, photo_url, term_start, term_end,
  member_since (earliest term start), bills_sponsored, bills_cosponsored

bills
  id (e.g. "hr-5408-119" = type-number-congress, PK), congress, bill_type, number,
  title, short_title, summary, status (latest action text), latest_action_date

roll_calls
  id (e.g. "house-119-2-216" = chamber-congress-session-roll, PK), chamber, congress,
  session, roll_number, vote_date, question, result, bill_id (nullable — many votes
  are procedural/nominations with no bill)

vote_positions
  roll_call_id, legislator_id, position (yea|nay|present|not_voting)
  composite PK (roll_call_id, legislator_id)
```

`bioguide_id` is the universal join key for members. Senate XML uses LIS member ids
that must be crosswalked to bioguide via `congress-legislators`.

## 5. Data sources

| Source | Used for |
| --- | --- |
| **Congress.gov API** (`api.congress.gov`) | Members, bills, summaries, sponsorship counts. Free key. 5,000 req/hr. |
| **House Clerk roll-call XML** (`clerk.house.gov`) | House votes + per-member positions (bioguide-keyed) |
| **Senate roll-call XML** (`senate.gov` LIS) | Senate votes + per-member positions (LIS-keyed) |
| **unitedstates/congress-legislators** (GitHub YAML) | Roster, party, terms, the canonical ID crosswalk, `member_since` |
| **unitedstates/images** (gh-pages) | Member portraits (keyed by bioguide) |

⚠️ **Do NOT use the ProPublica Congress API** — it is shut down (many old tutorials
still reference it). ⚠️ The Congress.gov API does **not** reliably expose Senate
roll-call positions — votes come from the chamber XML feeds, not the API.

## 6. What's built (current feature set)

- **Homepage:** full-screen hero + search; "Meet the 119th Congress" stats; party-colored
  cards (Republicans/Democrats/Independents → party list pages); "Longest-serving
  members" leaderboard; House/Senate **tabbed performance breakdown** (votes voted
  on / passed / failed by type + party split); auto-rotating **recent-votes carousel**.
- **`/members`** — directory grouped by state.
- **`/members/party/[party]`** — flat, filterable (chamber + state) party lists. Uses
  the reusable `MemberList` component (intended to later power a list-view for the main
  members page).
- **`/members/[id]`** — member profile: portrait (with initials fallback), party/seat,
  stats (in office since, bills sponsored/cosponsored, recorded votes, **votes-with-party %**),
  and recent votes.
- **`/bills`** — "Votes & legislation" browser over everything voted on: segmented type
  tabs (Bills/Resolutions/Nominations/Motions/Amendments), chamber filter, search,
  computed phase badges (Passed House/Senate/both, Failed, and a gold "Became law").
- **`/votes/[id]`** — vote detail: scoreboard (Yea/Nay/Present/Not-voting + bar),
  party breakdown table, full roster (10-at-a-time with party/position/state filters),
  "other votes on this bill", tap-to-expand long titles.
- **`/about`** — methodology & data sources.
- **Infra/SEO:** `sitemap.xml`, `robots.txt`, custom 404, loading skeleton, ballot-box
  favicon (`app/icon.svg`).

## 7. Data pipeline & current data state

**Ingestion scripts** (run against `DATABASE_URL`; idempotent upserts):
- `npm run sync:members` — roster from congress-legislators + sponsorship counts from
  Congress.gov. Marks departed members `in_office = false` (keeps their votes).
- `npm run sync:votes [n] [year]` — latest `n` roll calls per chamber (default 30,
  current year); pass a year to backfill a prior session (e.g. `-- 1500 2025`).
  Creates bill rows with real Congress.gov titles; crosswalks Senate LIS→bioguide.
- `npm run sync:all` — members then votes.

**Nightly cron:** `.github/workflows/sync.yml`. ⚠️ **The schedule is currently PAUSED**
(the `schedule:` trigger is commented out, to avoid recurring API calls during UI
iteration). Re-enable by uncommenting two lines. Manual runs still work via the
Actions tab (`workflow_dispatch`, with a custom roll-calls-per-chamber count).

**Current data:** the **full 119th Congress** is ingested (backfilled 2026-06-12) —
1,414 roll calls (584 House + 830 Senate, Jan 2025 → present), ~331k vote positions,
441 bills, 530 in-office members. DB size ≈ 65 MB (~13% of Neon's 500 MB free tier);
full-Congress data fits the free tier comfortably.

## 8. Conventions & workflow

- **Branch-per-feature → PR → merge.** `main` is protected (PR + passing CI required;
  no direct pushes).
- **CI gates every PR:** lint, typecheck, Vitest, production build. Verify visually in a
  local preview before merging.
- **Secrets:** `.env` (git-ignored) holds `CONGRESS_GOV_API_KEY` and `DATABASE_URL`.
  The same two are set as **GitHub Actions secrets** for the cron. Vercel needs them set
  in its project env (Production + Preview). **Never commit secrets — this repo is public.**
- **Node 22 via nvm.** Non-interactive shells may need
  `export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"`.
- **Shared values** (e.g. category lists) live in plain `lib/` modules, NOT in
  `"use client"` components — a runtime value imported from a client module into a
  server component becomes a broken proxy (TypeScript won't catch it).

## 9. Local setup

Requires Node 22. Create `.env` with the two secrets above, then:
```bash
nvm use            # Node 22
npm install
npm run dev        # http://localhost:3000  (uses the hosted Neon DB)
```
`npm run db:migrate` is only needed after schema changes. Useful gate before pushing:
`npm run lint && npm run typecheck && npm test && npm run build`.

## 10. Known data quirks (not bugs)

- **Kevin Kiley (CA)** is listed as Independent — that's the source data
  (`congress-legislators`), not a mistake.
- **~3,300 vote positions are skipped** on ingest: they belong to members who left
  office during the 119th (departed/replaced) and are no longer in
  `legislators-current`. Fixable later via `legislators-historical.yaml`.
- **Some new members** have no upstream portrait → the UI shows an initials avatar.
- **senate.gov rate-limits** aggressive fetching (403s). The sync fetches in small
  batches with pauses and warns loudly on failures; if a backfill reports failures,
  wait ~5–10 minutes and re-run (idempotent).

## 11. Backlog / what's next

**High-value next steps**
1. **Re-enable the nightly cron** once iteration settles (uncomment the schedule in
   `sync.yml`).
2. **Full bill catalog** — ingest all bills (not just voted ones) + summaries for richer
   bill pages. Also the moment to enrich nominations with nominee names and ingest
   departed members from `legislators-historical.yaml` (recovers the skipped positions).
3. **Codify ingestion validation/alerting** into the sync job.

**Saved-for-later feature ideas** (all computable from existing data)
- "Closest votes" section (ties & cliffhangers — e.g. a 209–209 House tie).
- Attendance / "most absent" leaderboard (missed-vote stats).
- Bipartisanship meter (how often both parties' majorities agree — currently ~17%).
- Top-sponsor badge on profiles (e.g. Grassley has sponsored ~2,467 bills lifetime).
- AI plain-English vote summaries (far future).
- OG image cards, custom domain.

**Post-MVP**
- Historical Congresses + former members.
- State legislators via the OpenStates API.
- A reusable "list view" for the main `/members` page (the `MemberList` component already
  supports this).

## 12. Working preferences

- Notion is **not** used for tracking (paused by the owner). Use this file + the repo.
- Prefer to verify changes in a running preview before merging.
- Ask before making outward-facing or hard-to-reverse changes; confirm decisions rather
  than assuming on ambiguous asks.
