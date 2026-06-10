import { describe, expect, it } from "vitest";
import { toLegislatorRow, type LegislatorRecord } from "./members";

const senator: LegislatorRecord = {
  id: { bioguide: "W000817", lis: "S396" },
  name: { first: "Elizabeth", last: "Warren", official_full: "Elizabeth Warren" },
  terms: [
    { type: "sen", start: "2013-01-03", end: "2019-01-03", state: "MA", party: "Democrat" },
    { type: "sen", start: "2025-01-03", end: "2031-01-03", state: "MA", party: "Democrat" },
  ],
};

const representative: LegislatorRecord = {
  id: { bioguide: "X000001" },
  name: { first: "Jane", last: "Doe" },
  terms: [
    { type: "rep", start: "2025-01-03", end: "2027-01-03", state: "OH", district: 3, party: "Republican" },
  ],
};

describe("toLegislatorRow", () => {
  it("maps a senator using their latest term", () => {
    expect(toLegislatorRow(senator)).toMatchObject({
      id: "W000817",
      fullName: "Elizabeth Warren",
      party: "Democrat",
      state: "MA",
      district: null,
      chamber: "senate",
      inOffice: true,
      termStart: "2025-01-03",
      termEnd: "2031-01-03",
      // earliest term, not the current one
      memberSince: "2013-01-03",
    });
  });

  it("maps a representative with a district", () => {
    expect(toLegislatorRow(representative)).toMatchObject({
      chamber: "house",
      state: "OH",
      district: "3",
    });
  });

  it("falls back to first + last when official_full is missing", () => {
    expect(toLegislatorRow(representative)?.fullName).toBe("Jane Doe");
  });

  it("stores at-large districts as district 0", () => {
    const atLarge = {
      ...representative,
      terms: [{ ...representative.terms[0], state: "WY", district: 0 }],
    };
    expect(toLegislatorRow(atLarge)?.district).toBe("0");
  });

  it("excludes non-voting delegates and the resident commissioner", () => {
    for (const state of ["DC", "PR", "GU", "VI", "AS", "MP"]) {
      const delegate = {
        ...representative,
        terms: [{ ...representative.terms[0], state }],
      };
      expect(toLegislatorRow(delegate)).toBeNull();
    }
  });

  it("keeps senators from every state (no senate jurisdiction filter)", () => {
    expect(toLegislatorRow(senator)).not.toBeNull();
  });

  it("builds the headshot URL from the bioguide id", () => {
    expect(toLegislatorRow(senator)?.photoUrl).toBe(
      "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/W000817.jpg",
    );
  });
});
