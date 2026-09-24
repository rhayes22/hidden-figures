# 03 — Scope & Sizing

## Recommendation

**Launch with the 117th, 118th, and 119th Congresses (2021 → present).** Architect so extending back is a data load, not a rewrite.

Three reasons:

1. **It fits the free tier.** ~129 MB against Neon's 500 MB. Zero hosting cost to ship.
2. **Bill metadata is complete for all three.** Every roll call can link to a real bill with a real title and summary. That is not true further back without extra work.
3. **It's a coherent product claim** — "the last three Congresses, complete" — rather than "some data from some years."

Extending to the **115th (2017)** also fits the free tier at ~218 MB, if you'd rather launch with a full decade. That's the only other option I'd put on the table now.

---

## Measured baseline

From the live Neon database, 5 September 2026:

| Table | Rows | Total | Bytes/row |
| --- | --- | --- | --- |
| `vote_positions` | 330,867 | 57 MB | **179.4** |
| `roll_calls` | 1,414 | 504 kB | 365.0 |
| `bills` | 441 | 312 kB | 724.5 |
| `legislators` | 530 | 296 kB | 572.0 |
| **Database** | | **65 MB** | |

---

## Exact roll-call counts for the launch scope

Counted directly from Voteview's per-Congress files:

| Congress | Years | House | Senate | Total |
| --- | --- | --- | --- | --- |
| 117th | 2021–22 | 996 | 949 | **1,945** |
| 118th | 2023–24 | 1,235 | 691 | **1,926** |
| 119th | 2025– *(in progress)* | 655 | 890 | **1,545** |
| | | | | **5,416** |

Member-congress rows: ~561 per Congress (≈457 House + ≈104 Senate — above 435/100 because of mid-term replacements). Roughly **700 distinct people** across all three, which is why per-term records matter.

> Note the 119th's Senate count (890) already exceeds the House (655) — the Senate has been running heavy on nominations this Congress. Our current DB has 1,414 of these 1,545; the gap is recent votes since the cron was paused.

---

## Range options

| Range | Years | Positions | Roll calls | Current schema | Optimized | Free tier? |
| --- | --- | --- | --- | --- | --- | --- |
| **Last 3 (117–119)** | 2021–26 | ~1,464,000 | 5,416 | 254 MB | **129 MB** | ✅ |
| Last 5 (115–119) | 2017–26 | ~2,487,000 | ~9,000 | 431 MB | **218 MB** | ✅ |
| Last 10 (110–119) | 2007–26 | ~5,990,000 | ~18,000 | 1.01 GB | 524 MB | ✗ |
| Modern era (100–119) | 1987–26 | ~11,137,000 | ~36,000 | 1.88 GB | 976 MB | ✗ |
| All history (1–119) | 1789–26 | 25,157,000 | 113,937 | 4.26 GB | 2.15 GB | ✗ |

Position counts are **derived** from measured per-Congress file sizes at 27.9 bytes/line. Roll-call counts for 117–119 are **exact**; wider ranges are estimated.

Cross-check on the launch scope: 2,886 House roll calls × ~435 members + 2,530 Senate × ~100 ≈ 1,508,000 — within 3% of the file-size derivation. The number is sound.

---

## Cost at each range

Optimized schema, September 2026 prices:

| Range | Size | Neon storage | Supabase Pro | Notes |
| --- | --- | --- | --- | --- |
| **Last 3** | 129 MB | *free tier* | $25 flat | **$0 to ship** |
| Last 5 | 218 MB | *free tier* | $25 flat | $0 to ship |
| Last 10 | 524 MB | $0.29 | $25 flat | just over free tier |
| Modern era | 976 MB | $0.53 | $25 flat | |
| All history | 2.15 GB | $1.18 | $25 flat | |

**Storage is never the deciding factor.** What actually costs money is compute: Neon meters it at $0.106/CU-hour, so an always-on database is $19–77/month regardless of how much data is in it. Supabase Pro's $25 flat includes compute.

**So the cost story is:** stay on Neon's free tier while the launch scope fits it. Move to a flat-rate plan when traffic — not data — demands always-on compute.

---

## The hard boundaries, and why "last 3" is a natural stopping point

| Boundary | What changes |
| --- | --- |
| **93rd (1973)** | Bill titles and summaries stop being reliably available |
| **100th (1987)** | Voteview per-Congress files stop; must use the 702 MB combined file |
| **101st (1989)** | Senate XML archive begins |
| **1990** | House Clerk XML archive begins |
| **118th (2023)** | Congress.gov vote API begins |

Between the 43rd and 81st Congresses there is a genuine **bill-metadata hole** — votes exist, bill records don't. Any claim to go "all the way back" would mean roll calls with vote descriptions but no linked legislation for a 78-year stretch. That's a real product decision, not a technical one, and it argues for the modern era.

---

## Growth

The 119th ends January 2027. At the current rate it will finish around **2,000 roll calls / ~600,000 positions**, adding roughly 40 MB. Each future Congress adds ~50 MB optimized.

**At ~50 MB per Congress, the free tier holds our launch scope plus about seven more Congresses of growth.** This is not a constraint that will bite for a decade.
