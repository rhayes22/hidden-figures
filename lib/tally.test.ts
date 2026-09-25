import { describe, expect, it } from "vitest";
import {
  COVERAGE_BUDGET,
  verifyCoverage,
  verifyReconciliation,
  verifyTally,
  type SkipReason,
} from "./tally";
import type { ParsedPosition } from "./votes";

// Positions are only ever counted, so a bucket's shape is irrelevant here —
// what matters is how many of each the chamber sees.
function positions(
  counts: Partial<Record<ParsedPosition, number>>,
): Array<{ position: ParsedPosition }> {
  const out: Array<{ position: ParsedPosition }> = [];
  for (const [position, n] of Object.entries(counts)) {
    for (let i = 0; i < (n ?? 0); i++) {
      out.push({ position: position as ParsedPosition });
    }
  }
  return out;
}

function skips(n: number, reason: SkipReason): Array<{ memberId: string; reason: SkipReason }> {
  return Array.from({ length: n }, (_, i) => ({ memberId: `X${i}`, reason }));
}

describe("verifyTally", () => {
  it("passes when every bucket matches", () => {
    expect(
      verifyTally(
        { kind: "buckets", yea: 51, nay: 47, present: 0, notVoting: 2 },
        positions({ yea: 51, nay: 47, not_voting: 2 }),
      ),
    ).toEqual({ ok: true, kind: "verified", published: 100, counted: 100 });
  });

  it("passes on a quorum call, where present is the whole vote", () => {
    // house-119-1-1's shape: 1,065 stored rows carry `present` today.
    expect(
      verifyTally(
        { kind: "buckets", yea: 0, nay: 0, present: 433, notVoting: 2 },
        positions({ present: 433, not_voting: 2 }),
      ),
    ).toEqual({ ok: true, kind: "verified", published: 435, counted: 435 });
  });

  it("fails on a single missing position, naming the bucket", () => {
    const verdict = verifyTally(
      { kind: "buckets", yea: 51, nay: 47, present: 0, notVoting: 2 },
      positions({ yea: 51, nay: 46, not_voting: 2 }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.kind).toBe("bucket-mismatch");
    if (verdict.kind !== "bucket-mismatch") return;
    expect(verdict.diffs).toEqual([
      { bucket: "nay", published: 47, counted: 46 },
    ]);
    expect(verdict.message).toContain("differing buckets: nay");
  });

  it("fails when the total matches but two buckets are swapped", () => {
    const verdict = verifyTally(
      { kind: "buckets", yea: 51, nay: 47, present: 0, notVoting: 2 },
      positions({ yea: 47, nay: 51, not_voting: 2 }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.kind).toBe("bucket-mismatch");
    if (verdict.kind !== "bucket-mismatch") return;
    expect(verdict.diffs).toEqual([
      { bucket: "yea", published: 51, counted: 47 },
      { bucket: "nay", published: 47, counted: 51 },
    ]);
  });

  it("fails a four-way rotation whose total is still correct", () => {
    // Stronger than the two-bucket swap: every bucket is wrong, the total is
    // right, and nothing about positions.length can notice.
    const verdict = verifyTally(
      { kind: "buckets", yea: 10, nay: 20, present: 30, notVoting: 40 },
      positions({ yea: 40, nay: 10, present: 20, not_voting: 30 }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.kind).toBe("bucket-mismatch");
    if (verdict.kind !== "bucket-mismatch") return;
    expect(verdict.diffs.map((d) => d.bucket)).toEqual([
      "yea",
      "nay",
      "present",
      "not_voting",
    ]);
  });

  it("reports no-tally rather than a silent pass when nothing was published", () => {
    expect(verifyTally({ kind: "none" }, positions({ yea: 3 }))).toEqual({
      ok: true,
      kind: "no-tally",
    });
    expect(verifyTally({ kind: "none" }, [])).toEqual({
      ok: true,
      kind: "no-tally",
    });
  });

  it("carries a malformed tally's reason through to the verdict", () => {
    const verdict = verifyTally(
      { kind: "malformed", reason: "yeas is not a number: fifty-one" },
      positions({ yea: 51 }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.kind).toBe("malformed-tally");
    if (verdict.kind !== "malformed-tally") return;
    expect(verdict.message).toBe("yeas is not a number: fifty-one");
  });

  it("checks a candidate tally on its member count alone", () => {
    expect(
      verifyTally({ kind: "total", total: 434 }, positions({ not_voting: 434 })),
    ).toEqual({ ok: true, kind: "total-only", published: 434, counted: 434 });

    const verdict = verifyTally(
      { kind: "total", total: 434 },
      positions({ not_voting: 433 }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.kind).toBe("total-mismatch");
    if (verdict.kind !== "total-mismatch") return;
    expect(verdict.published).toBe(434);
    expect(verdict.counted).toBe(433);
  });
});

describe("verifyCoverage", () => {
  // The shape 780 Senate roll calls have today: the chamber's own tally
  // reconciles exactly, and the one position that never reaches the database
  // is the one the crosswalk has no entry for.
  it("accepts a shortfall that carries a member id, and only then", () => {
    expect(
      verifyCoverage({
        parsedCount: 100,
        storedCount: 99,
        skipped: [{ memberId: "S293", reason: "no-crosswalk" }],
        budget: 5,
      }),
    ).toMatchObject({ ok: true, reason: "attributed", residual: 0 });

    expect(
      verifyCoverage({
        parsedCount: 100,
        storedCount: 99,
        skipped: [],
        budget: 5,
      }),
    ).toMatchObject({ ok: false, reason: "unattributed", residual: 1 });
  });

  it("fails a negative residual as readily as a positive one", () => {
    expect(
      verifyCoverage({
        parsedCount: 99,
        storedCount: 100,
        skipped: [],
        budget: 5,
      }),
    ).toMatchObject({ ok: false, reason: "unattributed", residual: -1 });
  });

  it("reports the per-reason breakdown of what was skipped", () => {
    expect(
      verifyCoverage({
        parsedCount: 435,
        storedCount: 430,
        skipped: [
          { memberId: "D000096", reason: "not-in-roster" },
          { memberId: "P000610", reason: "not-in-roster" },
          { memberId: "R000600", reason: "not-in-roster" },
          { memberId: "M001174", reason: "not-in-roster" },
          { memberId: "K000399", reason: "not-in-roster" },
        ],
        budget: 20,
      }),
    ).toMatchObject({
      ok: true,
      skippedCount: 5,
      byReason: { "not-in-roster": 5, "no-crosswalk": 0 },
    });
  });

  it("holds the Senate budget at its boundary", () => {
    expect(
      verifyCoverage({
        parsedCount: 100,
        storedCount: 95,
        skipped: skips(5, "no-crosswalk"),
        budget: COVERAGE_BUDGET.senate,
      }),
    ).toMatchObject({ ok: true, reason: "attributed" });

    expect(
      verifyCoverage({
        parsedCount: 100,
        storedCount: 94,
        skipped: skips(6, "no-crosswalk"),
        budget: COVERAGE_BUDGET.senate,
      }),
    ).toMatchObject({ ok: false, reason: "over-budget", residual: 0 });
  });

  it("holds the House budget at its boundary", () => {
    expect(
      verifyCoverage({
        parsedCount: 435,
        storedCount: 415,
        skipped: skips(20, "not-in-roster"),
        budget: COVERAGE_BUDGET.house,
      }),
    ).toMatchObject({ ok: true, reason: "attributed" });

    expect(
      verifyCoverage({
        parsedCount: 435,
        storedCount: 414,
        skipped: skips(21, "not-in-roster"),
        budget: COVERAGE_BUDGET.house,
      }),
    ).toMatchObject({ ok: false, reason: "over-budget" });
  });

  it("calls an unattributed position out even when the skips are over budget", () => {
    expect(
      verifyCoverage({
        parsedCount: 435,
        storedCount: 410,
        skipped: skips(21, "not-in-roster"),
        budget: COVERAGE_BUDGET.house,
      }),
    ).toMatchObject({ ok: false, reason: "unattributed", residual: 4 });
  });
});

describe("verifyReconciliation", () => {
  it("passes when the read-back is exactly what the run intended", () => {
    expect(verifyReconciliation({ intended: 99, stored: 99 })).toEqual({
      ok: true,
      kind: "matched",
      intended: 99,
      stored: 99,
    });
  });

  it("fails a read-back short of what the run intended", () => {
    expect(verifyReconciliation({ intended: 99, stored: 97 })).toEqual({
      ok: false,
      kind: "shortfall",
      intended: 99,
      stored: 97,
      missing: 2,
    });
  });

  // The case the script reaches via `stored.get(id) ?? 0`: a roll call the
  // read-back does not mention at all. Every write for it failed, and that
  // must be a shortfall rather than a roll call quietly passing.
  it("treats a read-back that omits the roll call entirely as a shortfall", () => {
    expect(verifyReconciliation({ intended: 430, stored: 0 })).toEqual({
      ok: false,
      kind: "shortfall",
      intended: 430,
      stored: 0,
      missing: 430,
    });
    // ...but a roll call that intended nothing and stored nothing is clean.
    expect(verifyReconciliation({ intended: 0, stored: 0 })).toMatchObject({
      ok: true,
      kind: "matched",
    });
  });

  // The shape ~830 Senate roll calls have today: Graham's position was stored
  // by an earlier sync, before his LIS id left legislators-current.yaml. It is
  // history the current roster cannot account for, not a bad write.
  it("reports a surplus read-back without failing the run", () => {
    expect(verifyReconciliation({ intended: 99, stored: 100 })).toEqual({
      ok: true,
      kind: "surplus",
      intended: 99,
      stored: 100,
      surplus: 1,
    });
  });
});

describe("COVERAGE_BUDGET", () => {
  // Measured maxima on 2026-09-24 over all 1,573 roll calls were House 15 and
  // Senate 3; these numbers cannot drift without a reviewer seeing the diff.
  it("is one departure-wave above the measured maxima", () => {
    expect(COVERAGE_BUDGET).toEqual({ house: 20, senate: 5 });
  });
});
