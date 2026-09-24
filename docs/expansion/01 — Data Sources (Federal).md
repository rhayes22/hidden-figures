# 01 — Data Sources (Federal)

Every endpoint below was requested live on **5 September 2026**. "Verified" means I got a real response and checked its shape, not that I read documentation claiming it exists.

---

## Summary: which source for which job

| Need | Use | Why |
| --- | --- | --- |
| Votes, 1789 → present | **Voteview** | Only complete source. Three files. |
| Votes, 1990 → present, official | House Clerk XML / Senate LIS XML | Authoritative primary record |
| Votes, 2023 → present | Congress.gov API | Convenient, but **history unavailable** |
| Member roster + ID crosswalk | `unitedstates/congress-legislators` | Canonical bioguide↔ICPSR↔LIS mapping |
| Bill titles & summaries, 1973 → present | Congress.gov API | Rich metadata |
| Full bill catalog in bulk | GovInfo BILLSTATUS | Avoids per-bill API calls |
| Member portraits | `unitedstates/images` | Keyed by bioguide |

---

## 1. Voteview — the historical spine

**UCLA/Lewis et al. Every congressional roll call since 1789.** Academic, freely redistributable, refreshed daily (the combined file's `Last-Modified` was the morning I checked).

### Files

| File | URL | Size | Contents |
| --- | --- | --- | --- |
| All votes | `https://voteview.com/static/data/out/votes/HSall_votes.csv` | **701,579,895 B** (702 MB) | ~25,157,000 member-vote rows |
| All roll calls | `.../rollcalls/HSall_rollcalls.csv` | **29,546,206 B** | 113,937 roll calls |
| All members | `.../members/HSall_members.csv` | **6,201,500 B** | Member-congress rows, **includes `bioguide_id`** |

**Per-Congress files** (much better for incremental loads):
```
https://voteview.com/static/data/out/votes/H119_votes.csv
https://voteview.com/static/data/out/votes/S119_votes.csv
https://voteview.com/static/data/out/rollcalls/H119_rollcalls.csv
https://voteview.com/static/data/out/members/H119_members.csv
```

> ⚠️ **Verified limit:** per-Congress files exist from the **100th (1987) onward only**. `H99_votes.csv` returns HTTP 404. Anything older must come from the combined 702 MB file. This does not affect our launch scope.

### Schemas

`*_votes.csv` — `congress, chamber, rollnumber, icpsr, cast_code, prob`

`*_rollcalls.csv` — `congress, chamber, rollnumber, date, session, clerk_rollnumber, yea_count, nay_count, nominate_mid_1, nominate_mid_2, nominate_spread_1, nominate_spread_2, nominate_log_likelihood, bill_number, vote_result, vote_desc, vote_question, dtl_desc`

`*_members.csv` — `congress, chamber, icpsr, state_icpsr, district_code, state_abbrev, party_code, occupancy, last_means, bioname, bioguide_id, born, died, nominate_dim1, nominate_dim2, ...`

### Two things to handle on ingest

**Cast codes.** Voteview uses 10 where our schema has 4. Store the raw code, derive the enum in a view — we keep fidelity and lose nothing.

| Code | Meaning | Maps to |
| --- | --- | --- |
| 0 | Not a member | *skip row* |
| 1 / 2 / 3 | Yea / paired yea / announced yea | `yea` |
| 4 / 5 / 6 | Announced nay / paired nay / nay | `nay` |
| 7 / 8 | Present | `present` |
| 9 | Not voting | `not_voting` |

**Keys.** Voteview joins on **ICPSR**, we key on **bioguide**. `HSall_members.csv` carries both, so the crosswalk is free — but it is a *(congress, chamber, icpsr) → bioguide* mapping, not a global one. Build the lookup per Congress.

`clerk_rollnumber` in the rollcalls file is the official Clerk roll number, which is what our existing `roll_calls.id` slug uses. That is the join back to anything we already ingested.

### Caveat worth stating in `/about`

Voteview is a research dataset, not the official record. For the 118th–119th we already have the primary sources; for older Congresses Voteview *is* the practical option. `vote_desc` on old roll calls is terse and upper-case — it will look different from modern rows in the UI.

---

## 2. Congress.gov API — rich metadata, no deep history

Key already in `.env` as `CONGRESS_GOV_API_KEY`.

### Verified coverage

| Endpoint | Coverage | Test result |
| --- | --- | --- |
| `/v3/house-vote/{congress}/{session}` | **118th–119th only** | 119 ✅, 118 ✅, **110 / 106 / 101 → `[]`** |
| `/v3/bill/{congress}` | **6th–42nd, 82nd–119th** | 119/117/110/106/103/100/96/93/92/91/90/89/88/86/84/82 ✅ · **43rd–81st → empty** · 41/42 ✅ · 1 → empty |
| `/v3/summaries/{congress}` | Modern Congresses | Available |
| `/v3/member/...` | Current + historical | Used today for sponsorship counts |

> ⚠️ **The most important finding in this document.** The API cannot backfill votes. Planning a historical ingest around it would fail after the 118th.

**Practical bill-metadata floor: the 93rd Congress (1973).** Coverage 82nd–92nd exists but is thinner; 43rd–81st is a genuine hole; 6th–42nd has limited early digitized records.

### Rate limit — correction to `docs/PROJECT.md`

Measured response headers:
```
x-ratelimit-limit: 20000
x-ratelimit-remaining: 19979
```
**20,000/hour, not the 5,000 currently documented.** Worth fixing in the brief — it materially changes what a backfill can do in one pass.

---

## 3. Chamber XML — the official primary record

| Source | Pattern | Coverage (verified) |
| --- | --- | --- |
| House Clerk | `https://clerk.house.gov/evs/{year}/roll{NNN}.xml` | **1990 → present.** 200s at 2026, 2020, 2010, 2001, 2000, 1999, 1995, 1990 |
| House index | `https://clerk.house.gov/evs/{year}/index.asp` | HTML listing per year |
| Senate menu | `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{congress}_{session}.xml` | 119-1 ✅, 107-1 ✅ |
| Senate vote | `.../roll_call_votes/vote{congress}{session}/vote_{c}_{s}_{NNNNN}.xml` | **101st (1989) → present.** 100th → 301 redirect |

House XML is bioguide-keyed. Senate XML is LIS-keyed and needs the crosswalk.

> ⚠️ `senate.gov` rate-limits aggressive fetching with 403s (already documented in the project brief). Small batches with pauses; the sync is idempotent so re-running is safe. **This is the reason to prefer Voteview for bulk backfill** — three file downloads instead of ~114,000 individual requests against two rate-limited government servers.

---

## 4. congress-legislators — roster and ID crosswalk

| File | URL | Size |
| --- | --- | --- |
| Current | `https://unitedstates.github.io/congress-legislators/legislators-current.json` | 1,468,926 B |
| **Historical** | `.../legislators-historical.json` | **13,483,039 B** |
| Historical (YAML) | `https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-historical.yaml` | 8,997,407 B |

**`legislators-historical` is required for this project and not currently used.** It is what:
- recovers the **~3,300 vote positions currently skipped** on ingest (members who left during the 119th)
- makes multi-Congress possible at all — most members of the 117th are not in `legislators-current`
- supplies the per-term party/state/district records that drive the schema change in `04`

Note the JSON variants — the sync script currently fetches YAML and parses it. JSON is smaller and needs no YAML parser.

---

## 5. GovInfo BILLSTATUS — bulk bill catalog

```
https://www.govinfo.gov/bulkdata/BILLSTATUS/{congress}/{billType}/BILLSTATUS-{congress}-{billType}.zip
```
Verified: `BILLSTATUS-119-hr.zip` → **31,041,306 B**, `application/zip`.

No API key, no rate limit, one request per Congress per bill type. This is the right way to build a full bill catalog (backlog item #2 in the project brief) instead of walking the Congress.gov API bill-by-bill.

---

## 6. Member portraits

```
https://unitedstates.github.io/images/congress/225x275/{bioguide}.jpg
```
Verified: `A000370.jpg` → 16,603 B. Also available at `450x550` and `original`. Coverage thins for older Congresses — the existing initials-avatar fallback already handles this.

---

## Licensing

| Source | Terms |
| --- | --- |
| Congress.gov, House Clerk, Senate, GovInfo | US Government works — public domain |
| Voteview | Academic, freely redistributable; cite Lewis et al. |
| congress-legislators / images | CC0 / public domain dedication |
| OpenStates | Public domain dedication, attribution encouraged |

**No licensing obstacle to a public site.** Add a citation line for Voteview to `/about` when we ingest it.
