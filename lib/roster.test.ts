import { describe, expect, it } from "vitest";
import { ROSTER_FLOOR, verifyRosterSize, type RosterCheck } from "./roster";

const KINDS: ReadonlyArray<RosterCheck["kind"]> = ["records", "senate-crosswalk"];

describe("verifyRosterSize", () => {
  it("holds the floors slice 4 measured", () => {
    expect(ROSTER_FLOOR).toEqual({ records: 500, "senate-crosswalk": 90 });
  });

  for (const kind of KINDS) {
    const floor = ROSTER_FLOOR[kind];

    describe(kind, () => {
      it("passes a count well above the floor", () => {
        expect(verifyRosterSize({ kind, count: floor + 100 })).toEqual({
          ok: true,
          kind,
          count: floor + 100,
          floor,
        });
      });

      it("fails an empty parse", () => {
        const verdict = verifyRosterSize({ kind, count: 0 });
        expect(verdict.ok).toBe(false);
        expect(verdict.count).toBe(0);
        expect(verdict.floor).toBe(floor);
      });

      it("fails one below the floor", () => {
        expect(verifyRosterSize({ kind, count: floor - 1 }).ok).toBe(false);
      });

      it("passes exactly at the floor — the predicate is count < floor", () => {
        expect(verifyRosterSize({ kind, count: floor })).toEqual({
          ok: true,
          kind,
          count: floor,
          floor,
        });
      });

      it("names the count and the floor when it fails", () => {
        const verdict = verifyRosterSize({ kind, count: 3 });
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.message).toContain("3");
        expect(verdict.message).toContain(String(floor));
      });
    });
  }

  it("passes today's measured roster: 539 records", () => {
    expect(verifyRosterSize({ kind: "records", count: 539 }).ok).toBe(true);
  });

  it("passes today's measured crosswalk: 100 senators, all with an id.lis", () => {
    expect(verifyRosterSize({ kind: "senate-crosswalk", count: 100 }).ok).toBe(
      true,
    );
  });
});
