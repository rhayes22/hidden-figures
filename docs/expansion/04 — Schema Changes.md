# 04 — Schema Changes

**This is the gate on everything else.** Two independent problems, both fixed in one migration.

---

## Problem 1 — the schema is factually wrong across Congresses *(correctness)*

`legislators` stores **one** party, **one** state, **one** district, **one** chamber per person:

```ts
legislators = { id: bioguide, fullName, party, state, district, chamber, inOffice, ... }
```

Across multiple Congresses those are all time-varying:

- **Party switches.** Members change party mid-career. One `party` column can only record the latest, silently rewriting how their older votes appear.
- **Chamber moves.** A member serves in the House, then wins a Senate seat. One `chamber` column makes their House votes look like Senate votes.
- **Redistricting.** District numbers change between cycles.
- **`inOffice`** is a current-Congress concept that means nothing when browsing the 117th.

> Load the 117th into today's schema and you get a database that renders history incorrectly — quietly, with no error. This is not an optimization. It has to be fixed before any backfill.

## Problem 2 — 179 bytes to store 10 bytes *(cost)*

`vote_positions` uses text foreign keys. Every row repeats `"house-119-1-123"` plus a bioguide ID, in the heap **and** in both indexes — which is why indexes (27 MB) nearly equal the data (29 MB).

| | Now | After |
| --- | --- | --- |
| Bytes/row | 179.4 | ~90 |
| Launch scope (1.46 M rows) | 254 MB | **129 MB** |
| All history (25.2 M rows) | 4.26 GB | 2.15 GB |

Trivial to change at 331k rows. Painful at 25 million.

---

## Proposed model

Integer surrogate keys internally, **human-readable slugs preserved for URLs**. Existing links like `/votes/house-119-1-123` keep working — the slug becomes a unique column instead of the primary key.

```ts
// NEW — the seam for state legislatures (02). One row today: 'us-congress'.
jurisdictions = {
  id: serial PK,
  slug: text unique,          // 'us-congress', later 'ca-legislature'
  name: text,
  level: enum('federal','state'),
}

// NEW — a real dimension, so "browse by Congress" is a join not a filter
congresses = {
  number: integer PK,         // 119
  jurisdictionId: FK,
  startDate: date,            // 2025-01-03
  endDate: date,
  session1Year: integer,
  session2Year: integer,
}

// CHANGED — identity only. Nothing that varies over time.
legislators = {
  id: serial PK,              // was: bioguide text
  bioguideId: text unique,    // preserved, still the public key
  jurisdictionId: FK,
  fullName: text,
  born: date, died: date,
  photoUrl: text,
  memberSince: date,
}

// NEW — this is the fix for Problem 1
legislatorTerms = {
  id: serial PK,
  legislatorId: FK,
  congress: FK → congresses.number,
  chamber: enum('house','senate'),
  party: text,
  state: text,
  district: text,             // null for senators
  termStart: date, termEnd: date,
  billsSponsored: integer,    // per-Congress, not lifetime
  billsCosponsored: integer,
  unique (legislatorId, congress, chamber)
}

// CHANGED — int PK, slug preserved
bills = {
  id: serial PK,
  slug: text unique,          // 'hr-1234-119'
  congress: FK, billType, number, title, shortTitle, summary,
  status, latestActionDate,
}

// CHANGED — int PK, slug preserved
rollCalls = {
  id: serial PK,
  slug: text unique,          // 'house-119-1-123'
  jurisdictionId: FK,
  chamber, congress: FK, session, rollNumber,
  voteDate, question, result,
  billId: FK → bills.id (nullable),
  source: text,               // 'clerk' | 'senate-lis' | 'voteview'
}

// CHANGED — the whole point of the exercise
votePositions = {
  rollCallId: integer FK,
  legislatorId: integer FK,
  castCode: smallint,         // raw Voteview 0–9, full fidelity
  position: enum GENERATED from castCode,
  PK (rollCallId, legislatorId)
}
```

### Why store `castCode` *and* `position`

`castCode` preserves what the source actually said — a *paired* yea is not the same as a plain yea, and losing that distinction is irreversible. `position` stays as a generated column so every existing query keeps working unchanged.

### Indexes

Keep `vote_positions(legislator_id)`, `roll_calls(vote_date)`, `roll_calls(bill_id)`. Add `roll_calls(congress, chamber)` and `legislator_terms(congress, chamber)` — both are hot paths once the UI is Congress-scoped. Keep `pg_trgm` on the search columns.

---

## Precomputed stats — needed before the data grows

"Votes with party %", recorded-vote counts, and attendance are currently computed per request. At 331k rows that's fine. At 1.5 M — and eventually 25 M — it isn't, and each stat becomes per-Congress rather than lifetime.

```ts
memberCongressStats = {
  legislatorId: FK, congress: FK,
  votesEligible, votesCast, votesWithParty, votesMissed,
  PK (legislatorId, congress)
}
```

Refresh on ingest. A few thousand rows, negligible storage, turns every profile-page aggregate into a single indexed lookup. **Do this in the same PR as the backfill**, before the slow queries ever ship.

---

## Migration approach

The database is small and the site is not yet under real traffic, so the simple path is the right one.

1. `npm run db:generate` for the new tables alongside the existing ones
2. Backfill in SQL — populate `jurisdictions`, `congresses`, then `legislators` → `legislator_terms` from `legislators-historical.json` + `legislators-current.json`
3. Remap `bills` / `roll_calls` / `vote_positions` onto integer keys, slugs carried across
4. Verify counts match: **330,867 positions, 1,414 roll calls, 441 bills** must survive exactly
5. Drop the old tables in a follow-up migration, once the app is verified against the new ones

**Take a Neon branch before step 3.** It's free, instant, and makes the whole thing reversible.

### Application changes this forces

- `lib/ids.ts` keeps `makeRollCallId` / `makeBillId` — they now generate **slugs**, not primary keys. Worth renaming to `makeRollCallSlug` / `makeBillSlug` for clarity.
- Every query in `lib/members.ts`, `lib/votes.ts`, `lib/legislation.ts` joins through `legislator_terms` for party/state/chamber, scoped to a Congress.
- Page params still take slugs; resolve slug → id at the top of each loader.
- `lib/bill-search.ts` gains a Congress filter.

> **Public URLs do not change.** `/votes/house-119-1-123` and `/members/A000370` keep resolving. That protects existing links and the sitemap.
