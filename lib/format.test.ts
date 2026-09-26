import { describe, expect, it } from "vitest";
import { partyBreakdown, seatLabel, truncate } from "./format";

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

describe("truncate", () => {
  it("leaves text within the budget untouched", () => {
    expect(truncate("On the Nomination", 70)).toBe("On the Nomination");
  });

  it("clamps longer text to the budget, ellipsis included", () => {
    const clamped = truncate("a".repeat(200), 70);
    expect(clamped).toHaveLength(70);
    expect(clamped.endsWith("…")).toBe(true);
  });

  it("does not leave a dangling space before the ellipsis", () => {
    expect(truncate("Stephen Vaden, of Tennessee", 16)).toBe("Stephen Vaden,…");
  });
});

// --- QA additions -----------------------------------------------------------
// truncate feeds a <title> and a <meta name="description">, both of which have a
// hard budget. The invariant that matters is "never longer than max"; the
// boundary is where an off-by-one would hide.

describe("truncate boundaries", () => {
  it("leaves text of exactly the budget untouched", () => {
    const exact = "a".repeat(70);
    expect(truncate(exact, 70)).toBe(exact);
  });

  it("clamps text one character over the budget to exactly the budget", () => {
    const clamped = truncate("a".repeat(71), 70);
    expect(clamped).toHaveLength(70);
    expect(clamped).toBe(`${"a".repeat(69)}…`);
  });

  it("never exceeds the budget at any input length around it", () => {
    for (const max of [1, 2, 10, 70, 150]) {
      for (let len = 0; len <= max + 3; len++) {
        expect(truncate("x".repeat(len), max).length).toBeLessThanOrEqual(max);
        expect(truncate("x ".repeat(len), max).length).toBeLessThanOrEqual(max);
      }
    }
  });

  it("keeps the clamped text a prefix of the original", () => {
    const subject =
      "Neil Jacobs, of North Carolina, to be Under Secretary of Commerce for Oceans and Atmosphere";
    const clamped = truncate(subject, 70);
    expect(clamped.endsWith("…")).toBe(true);
    expect(subject.startsWith(clamped.slice(0, -1))).toBe(true);
  });
});

// --- Slice 5: a computed budget can land at or below zero ------------------
// /votes/[id] now passes META_DESCRIPTION_MAX minus a prefix whose length
// varies with the chamber name and the formatted date, so the budget is no
// longer a literal. Before the guard, slice(0, -1) counted from the end and
// truncate("Hello world", 0) returned "Hello worl…" — longer than the input
// budget, and longer than the input is allowed to be.

describe("truncate with a non-positive budget", () => {
  it("returns an empty string for a budget of 0", () => {
    expect(truncate("Hello world", 0)).toBe("");
  });

  it("returns an empty string for a negative budget", () => {
    expect(truncate("Hello world", -3)).toBe("");
  });

  it("returns just the ellipsis for a budget of 1", () => {
    expect(truncate("Hello world", 1)).toBe("…");
  });

  it("never returns more than max characters, for any budget", () => {
    const samples = ["", "a", "Hello world", "x ".repeat(120), "é".repeat(40)];
    for (const max of [-5, 0, 1, 2, 10, 70, 160]) {
      for (const s of samples) {
        expect(truncate(s, max).length).toBeLessThanOrEqual(Math.max(0, max));
      }
    }
  });

  // The shape /votes/[id]'s generateMetadata actually composes:
  //   prefix + truncate(body, META_DESCRIPTION_MAX - prefix.length)
  // The guard is what makes the whole string fit the budget once the prefix
  // eats all of it. Asserted across every prefix length up to the budget,
  // because the prefix grows with the chamber name and the formatted date.
  it("keeps a prefix-plus-clamped-body composition inside the budget", () => {
    const MAX = 160;
    const bodies = [
      "",
      "Short.",
      "This bill requires states to provide such information as the Department of Justice may require for the purpose of investigating alleged fraud.",
      "x".repeat(200_000),
    ];
    for (let prefixLength = 0; prefixLength <= MAX; prefixLength++) {
      const prefix = "p".repeat(prefixLength);
      for (const body of bodies) {
        const composed = prefix + truncate(body, MAX - prefix.length);
        expect(composed.length).toBeLessThanOrEqual(MAX);
      }
    }
  });
});
