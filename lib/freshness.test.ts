import { describe, expect, it } from "vitest";
import { assessFreshness } from "./freshness";

const NOW = new Date("2026-09-25T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function checkedAgo(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("assessFreshness", () => {
  it("is current when the pipeline ran an hour ago", () => {
    expect(
      assessFreshness({
        latestVoteDate: "2026-09-24",
        lastCheckedAt: checkedAgo(HOUR),
        now: NOW,
      }),
    ).toEqual({
      kind: "current",
      latestVoteDate: "2026-09-24",
      checkedDate: "2026-09-25",
    });
  });

  it("is still current at 47h59m — one delayed night is not an alarm", () => {
    const verdict = assessFreshness({
      latestVoteDate: "2026-09-24",
      lastCheckedAt: checkedAgo(47 * HOUR + 59 * 60 * 1000),
      now: NOW,
    });
    expect(verdict.kind).toBe("current");
  });

  it("is stale at exactly 48h — the boundary is inclusive, two missed nights", () => {
    const verdict = assessFreshness({
      latestVoteDate: "2026-09-24",
      lastCheckedAt: checkedAgo(48 * HOUR),
      now: NOW,
    });
    expect(verdict.kind).toBe("stale");
  });

  it("counts whole days since the check when stale", () => {
    expect(
      assessFreshness({
        latestVoteDate: "2026-09-24",
        lastCheckedAt: checkedAgo(5 * 24 * HOUR),
        now: NOW,
      }),
    ).toEqual({
      kind: "stale",
      checkedDate: "2026-09-20",
      daysSinceCheck: 5,
    });
  });

  it("is unknown when no successful sync is on record", () => {
    expect(
      assessFreshness({
        latestVoteDate: "2026-09-24",
        lastCheckedAt: null,
        now: NOW,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("is unknown with a fresh check but no roll calls — nothing to be current about", () => {
    expect(
      assessFreshness({
        latestVoteDate: null,
        lastCheckedAt: checkedAgo(HOUR),
        now: NOW,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("stays current through a recess: an old roll call is not a stale pipeline", () => {
    // The House's measured 54-day recess gap. The legislation is old and
    // nothing is wrong — this is why two numbers are shown, not one.
    const verdict = assessFreshness({
      latestVoteDate: "2026-07-03",
      lastCheckedAt: checkedAgo(2 * HOUR),
      now: NOW,
    });
    expect(verdict.kind).toBe("current");
    expect(verdict.kind === "current" && verdict.latestVoteDate).toBe(
      "2026-07-03",
    );
  });
});
