// Maps records from unitedstates/congress-legislators (legislators-current.yaml)
// to rows for the legislators table.

import type { legislators } from "@/db/schema";

export type LegislatorRecord = {
  id: { bioguide: string; lis?: string };
  name: { first: string; last: string; official_full?: string };
  terms: Array<{
    type: "rep" | "sen";
    start: string;
    end: string;
    state: string;
    district?: number;
    party?: string;
  }>;
};

export type LegislatorRow = typeof legislators.$inferInsert;

// Delegates and the PR resident commissioner sit in the House but cannot
// vote on the floor — the MVP tracks the 535 voting members only.
const NON_VOTING_JURISDICTIONS = new Set(["DC", "PR", "GU", "VI", "AS", "MP"]);

// theunitedstates.io (the project's CDN) returns 410 Gone; the same images
// remain maintained on the repo's gh-pages branch.
export function photoUrl(bioguideId: string): string {
  return `https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/${bioguideId}.jpg`;
}

// Returns null for non-voting members, which the sync skips.
export function toLegislatorRow(rec: LegislatorRecord): LegislatorRow | null {
  const term = rec.terms.at(-1);
  if (!term) {
    throw new Error(`${rec.id.bioguide} has no terms`);
  }
  const chamber = term.type === "sen" ? "senate" : "house";
  if (chamber === "house" && NON_VOTING_JURISDICTIONS.has(term.state)) {
    return null;
  }
  // Terms are chronological, so the first is when they first took office.
  const memberSince = rec.terms[0]?.start ?? term.start;
  return {
    id: rec.id.bioguide,
    fullName:
      rec.name.official_full ?? `${rec.name.first} ${rec.name.last}`,
    party: term.party ?? "Unknown",
    state: term.state,
    district: chamber === "house" ? String(term.district ?? 0) : null,
    chamber,
    inOffice: true,
    photoUrl: photoUrl(rec.id.bioguide),
    termStart: term.start,
    termEnd: term.end,
    memberSince,
  };
}
