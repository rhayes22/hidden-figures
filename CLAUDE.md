# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project brief

The full project brief, current state, data quirks, and backlog live in
[docs/PROJECT.md](docs/PROJECT.md). Read it before starting substantial work.
Post-MVP expansion research (state legislators, historical Congresses) is in
[docs/expansion/](docs/expansion/).

## Commands

Node 22 is required (`.nvmrc`). Non-interactive shells may need
`export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"`.

```bash
npm run dev                  # http://localhost:3000 — serves against the live Neon DB
npm run lint && npm run typecheck && npm test && npm run build   # the CI gate, run before pushing
npx vitest run lib/votes.test.ts        # a single test file
npx vitest run -t "normalizePosition"   # a single test by name
```

Data ingestion (writes to whatever `DATABASE_URL` points at — that is production Neon):

```bash
npm run sync:members         # roster + sponsorship counts
npm run sync:votes           # latest 30 roll calls per chamber, current year
npm run sync:votes -- 1500 2025   # backfill a prior session (count, then year)
npm run db:generate          # after editing db/schema.ts → new SQL in drizzle/
npm run db:migrate           # apply pending migrations
```

## Architecture

Two independent halves that meet only at the Postgres database:

1. **Ingestion** (`scripts/` + pure parsers in `lib/`) — run by hand or by
   [.github/workflows/sync.yml](.github/workflows/sync.yml), never by the web app.
2. **Web** (`app/` + `components/`) — read-only Next.js App Router site on Vercel.

**Ingestion flow.** `scripts/sync-members.ts` pulls `legislators-current.yaml` from
unitedstates/congress-legislators and upserts via `toLegislatorRow` ([lib/members.ts](lib/members.ts)),
skipping non-voting delegates (DC/PR/GU/VI/AS/MP) and flagging departed members
`in_office = false` rather than deleting them. `scripts/sync-votes.ts` binary-searches the
House Clerk feed for the latest roll number, walks backwards, and pairs each chamber's XML
with a parser in [lib/votes.ts](lib/votes.ts). House XML is keyed by bioguide id; **Senate XML is
keyed by LIS id and is crosswalked to bioguide inside the sync** using the same YAML roster —
that crosswalk is the one place the two chambers differ structurally. Everything upserts by
natural id, so re-running is safe; senate.gov rate-limits, so fetches go in batches of 5 with
pauses and failures are warned about loudly rather than swallowed.

**IDs are the contract.** [lib/ids.ts](lib/ids.ts) owns both natural-key formats — bills
`hr-1234-119` (type-number-congress), roll calls `house-119-1-123`
(chamber-congress-session-roll). Schema PKs, ingestion, and URL routes all use them, so change
them nowhere else. Roll calls with no associated bill (nominations, cloture, procedural motions)
carry `bill_id = null` and are classified from the question text by `categoryForQuestion`
([lib/legislation.ts](lib/legislation.ts)).

**Web data access has no query layer.** Server components import `db` from [db/index.ts](db/index.ts)
and write their own Drizzle queries inline; aggregate stats (party loyalty, chamber breakdowns,
leaderboards) are raw tagged-template SQL via `db.execute` inside the page that renders them. There is no
`lib/queries.ts` and no ORM relations config — follow the local pattern rather than introducing one
casually. `db/index.ts` throws on a missing `DATABASE_URL` except during `next build`
(`NEXT_PHASE === "phase-production-build"`), since the build enumerates routes without querying.

**Rendering strategy is deliberate and split by page kind:**

- List/index pages (`/`, `/members`, `/members/party/[party]`, `/bills`, `sitemap.ts`) —
  `export const dynamic = "force-dynamic"`.
- Detail pages (`/members/[id]`, `/votes/[id]`) — `export const revalidate = 3600` plus an
  **empty `generateStaticParams()`**, which opts into on-demand ISR: nothing is prerendered at
  build time, pages cache on first request. Keep the empty function if you touch those routes.

**Client components** (`components/*.tsx` with `"use client"`) are presentation and filtering
only — they receive already-queried rows as props. Interactive filtering (vote roster, bills
browser, member list) happens in the browser over a full result set, not via round-trips.

## Conventions

- Shared runtime values (category lists, label maps) belong in plain `lib/` modules, **never**
  in a `"use client"` module. A value imported from a client module into a server component
  becomes a broken proxy and TypeScript will not catch it.
- `lib/*` is pure and dependency-free of the database — that is why it is the only thing with
  unit tests (`lib/*.test.ts`, plus `db/schema.test.ts` asserting table/enum shape). Vitest runs
  with no config file; put new logic in `lib/` if it deserves a test.
- Tailwind v4, theme tokens only: `flag-blue`, `flag-blue-deep`, `flag-blue-soft`, `flag-red`,
  `flag-red-soft`, defined in [app/globals.css](app/globals.css). Party badge/label styling goes
  through [lib/format.ts](lib/format.ts) helpers, not ad-hoc classes.
- Branch per feature → PR → merge. `main` is protected; CI (lint, typecheck, test, build) must
  pass. Verify visually in a running preview before merging.
- The repo is **public** and `.env` holds real credentials — never commit secrets, and never put
  `DATABASE_URL` or `CONGRESS_GOV_API_KEY` values into code, tests, or docs.
- Do not reach for the ProPublica Congress API (shut down), and do not expect Senate roll-call
  positions from the Congress.gov API — they only exist in the chamber XML feeds.
