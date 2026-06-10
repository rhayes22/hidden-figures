import { describe, expect, it } from "vitest";
import { partyBreakdown, seatLabel } from "./format";

describe("partyBreakdown", () => {
  it("tallies positions per party and orders D, R, then others", () => {
    const rows = [
      { party: "Republican", position: "yea" },
      { party: "Democrat", position: "nay" },
      { party: "Democrat", position: "nay" },
      { party: "Independent", position: "present" },
      { party: "Republican", position: "not_voting" },
      { party: "Democrat", position: "yea" },
    ];
    expect(partyBreakdown(rows)).toEqual([
      { party: "Democrat", yea: 1, nay: 2, present: 0, not_voting: 0 },
      { party: "Republican", yea: 1, nay: 0, present: 0, not_voting: 1 },
      { party: "Independent", yea: 0, nay: 0, present: 1, not_voting: 0 },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(partyBreakdown([])).toEqual([]);
  });
});

describe("seatLabel", () => {
  it("labels senators without a district", () => {
    expect(seatLabel({ chamber: "senate", state: "MA", district: null })).toBe(
      "Senator · MA",
    );
  });

  it("labels representatives with their district", () => {
    expect(seatLabel({ chamber: "house", state: "OH", district: "4" })).toBe(
      "Representative · OH-4 (District 4)",
    );
  });

  it("labels at-large representatives", () => {
    expect(seatLabel({ chamber: "house", state: "WY", district: "0" })).toBe(
      "Representative · WY-AL (At-Large)",
    );
  });
});
