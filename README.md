# Hidden Figures

How did your representatives actually vote? Search any member of the U.S. Congress and see their recent votes, or search any bill and see the full yea/nay roster.

**Status:** Phase 0 — planning and data-source validation. Full plan and task board live in [Notion](https://app.notion.com/p/37b6bd6e00b7814ebaf2fdf800c94081).

## MVP scope

The 535 voting members of the current (119th) Congress — House and Senate. Historical Congresses and state legislators are post-MVP.

## Stack

- **Web:** Next.js (App Router) on Vercel
- **Database:** Postgres on Neon, migrations via Drizzle
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

## Local setup

Requires Node 22+. Secrets live in `.env` (git-ignored):

```
CONGRESS_GOV_API_KEY=...   # free key from api.congress.gov/sign-up
DATABASE_URL=...           # Neon connection string
```
