# 05 — Product & Information Architecture

## The organizing idea

**The current Congress is the front door. Previous Congresses are rooms you can walk into.**

Someone arriving cold wants "how is my representative voting *right now*" — that's the homepage, unchanged. Someone doing research wants "how did this person vote in 2021" — that's a Congress switcher, not a different site.

The design consequence: **the current Congress is never labelled as a choice on the homepage.** It's just the site. The switcher appears once you're deep enough that time matters — on a member profile, a vote list, a bill browser.

---

## Routes

Existing URLs are all preserved and become aliases for the current Congress.

| Route | Now | After |
| --- | --- | --- |
| `/` | 119th landing | **unchanged** — current Congress landing |
| `/members` | directory | current Congress, + switcher |
| `/members/[bioguide]` | profile | current Congress view, + "served in" nav |
| `/bills` | vote browser | current Congress, + switcher |
| `/votes/[slug]` | vote detail | **unchanged** — slug already encodes the Congress |
| `/about` | methodology | **unchanged** |

New:

| Route | Purpose |
| --- | --- |
| `/congress` | index of all available Congresses — the "go back in time" entry point |
| `/congress/[number]` | landing page for one Congress: dates, composition, headline votes |
| `/congress/[number]/members` | directory scoped to that Congress |
| `/congress/[number]/bills` | vote browser scoped to that Congress |
| `/members/[bioguide]/congress/[number]` | that member's record in that specific Congress |

`/congress/119/...` should **301 to the canonical un-prefixed route** so the current Congress has exactly one URL. Prevents duplicate content and keeps the sitemap clean.

---

## What each new page does

### `/congress` — the archive index

A short, dense list. One row per Congress: number, years, party control of each chamber, roll-call count, notable legislation. This is the page that communicates the site's scope at a glance, and it's the natural place to be honest about where coverage begins and ends.

### `/congress/[number]` — a Congress landing page

Mirrors the homepage's structure so the experience is continuous:

- Header: "117th Congress · January 2021 – January 2023"
- Composition at the time — party splits per chamber, computed from `legislator_terms`, **not** from current party
- Roll-call totals, most-contested votes, closest margins
- Entry points into that Congress's members and votes

### `/members/[bioguide]` — the profile, now time-aware

The biggest UX change. A member is no longer "a Republican from Texas" — they're a person with a **sequence of terms**.

- Default view: their most recent Congress in our data
- A "served in" strip: `117th · 118th · 119th` — clickable
- Party/state/district shown **as of the Congress being viewed**
- Stats (votes cast, votes with party, attendance) per Congress, from `member_congress_stats`
- Career totals shown separately and labelled as such

> This is where the schema change pays off visibly. A member who switched parties or moved from House to Senate renders correctly instead of misleadingly.

### The Congress switcher

One control, used everywhere. A compact segmented control when there are few Congresses (our launch case), degrading to a dropdown as the archive grows. It must:

- show which Congresses actually have data — never offer an empty year
- preserve context when switching (viewing a member → switch → same member, different Congress)
- be a real link, not client-side state, so it's crawlable and shareable

---

## Copy and framing

Small wording changes carry the scope shift:

- "Meet the 119th Congress" → keep on `/`, but the equivalent block on an archive page reads "The 117th Congress" in past tense
- Vote pages already carry a date; make the Congress explicit next to it
- `/about` gains a **coverage** section: which Congresses, which sources, where the data begins and why

### Say what we don't have

An honest coverage statement is a feature. `/about` and `/congress` should both state plainly: *"Hidden Figures currently covers the 117th through 119th Congresses (2021–present). Vote records exist back to 1789 and we intend to go further back; bill details are only reliably available from 1973."*

That sentence costs nothing, pre-empts the obvious question, and makes the site look rigorous rather than incomplete.

---

## Deliberately not in scope now

- **State legislatures.** Seam only (see `02`). No UI.
- **Pre-117th Congresses.** The architecture supports them; loading them is a data task once the UI is proven.
- **Full bill catalog.** Still backlog. GovInfo BILLSTATUS is the path when we get there.
- **AI vote summaries.** Still far future.
