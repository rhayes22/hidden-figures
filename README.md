# Hidden Figures

How did your representatives actually vote? Search any member of the U.S. Congress and see their recent votes, or search any bill and see the full yea/nay roster.

**Status:** Phase 1 — data pipeline. Full plan and task board live in [Notion](https://app.notion.com/p/37b6bd6e00b7814ebaf2fdf800c94081).

## MVP scope

The 535 voting members of the current (119th) Congress — House and Senate. Historical Congresses and state legislators are post-MVP.

## Stack

- **Web:** Next.js (App Router) on Vercel
- **Database:** Postgres on Neon, schema + migrations via Drizzle ([db/schema.ts](db/schema.ts))
- **Ingestion:** Node script run nightly via GitHub Actions cron
- **Search:** Postgres `pg_trgm`

## Data sources

| Source | Used for |
| --- | --- |
| [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov) | Members, bills, summaries |
| [House Clerk roll-call XML](https://clerk.house.gov/Votes) | House votes, per-member positions |
| [Senate roll-call XML](https://www.senate.gov/legislative/votes_new.htm) | Senate votes, per-member positions |
| [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | Member roster + ID crosswalk |
| [unitedstates/images](https://github.com/unitedstates/images) | Member headshots |

## Run it locally

Requires **Node 22** (`.nvmrc` pins it — run `nvm use` if you use nvm). Secrets live in `.env` (git-ignored):

```
CONGRESS_GOV_API_KEY=...   # free key from api.congress.gov/sign-up
DATABASE_URL=...           # Neon pooled connection string
```

```bash
nvm use              # selects Node 22 (skip if 22 is already your default)
npm install
npm run dev          # http://localhost:3000
```

The dev server serves the full site at **http://localhost:3000** against the live Neon database — no local Postgres needed. The schema is already migrated; you only need `npm run db:migrate` if you change `db/schema.ts`.

Useful checks before pushing:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Deploying to Vercel

The repo is connected to Vercel, so **every push to `main` deploys to production** and every PR gets a preview URL automatically. Two things the deploy needs:

1. **Environment variables** — in the Vercel project (Settings → Environment Variables), set the same two keys as `.env`, for Production **and** Preview:
   - `DATABASE_URL` (Neon pooled connection string)
   - `CONGRESS_GOV_API_KEY`

   Without `DATABASE_URL` the build still succeeds (the DB is only touched at request time), but pages will error at runtime until it's set.

   Optionally set `NEXT_PUBLIC_SITE_URL` (e.g. `https://hiddenfigures.vote`) so `sitemap.xml`, `robots.txt`, and Open Graph tags use your canonical domain. It falls back to the Vercel deployment URL if unset.

2. **Node version** — pinned to 22 via `engines.node` in `package.json` and `.nvmrc`; Vercel honors both.

## Data refresh

Ingestion is separate from the Vercel build. A GitHub Actions workflow ([.github/workflows/sync.yml](.github/workflows/sync.yml)) runs nightly at 06:00 UTC, syncing members then the latest roll calls into Neon (idempotent upserts). It can also be run manually from the Actions tab with a custom **roll calls per chamber** count to backfill further.

Locally, against the same `DATABASE_URL`:

```bash
npm run sync:members         # current roster
npm run sync:votes           # latest 30 roll calls per chamber
npm run sync:votes -- 250    # backfill the whole current session
npm run sync:all             # members + votes
```

## Database workflow

The schema is defined in [db/schema.ts](db/schema.ts) — four tables: `legislators`, `bills`, `roll_calls`, `vote_positions`.

- Change the schema → `npm run db:generate` writes a new SQL migration to `drizzle/`
- `npm run db:migrate` applies pending migrations to the database in `DATABASE_URL`
- `npm run db:studio` opens a local data browser
