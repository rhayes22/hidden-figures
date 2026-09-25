// Verification arithmetic for the ingest: does what a chamber published about
// a roll call agree with what we parsed out of it, and is every position we
// then failed to store accounted for by name?
//
// Pure by design — no database, no network, no script imports — because
// lib/ is the only unit-tested layer (CLAUDE.md, "Conventions"). It returns
// verdicts and never logs or exits; scripts/sync-votes.ts decides what a
// verdict means for the run.

import type { Chamber } from "./ids";
import type { ParsedPosition, PublishedTally } from "./votes";

export type TallyVerdict =
  | { ok: true; kind: "verified"; published: number; counted: number }
  | { ok: true; kind: "total-only"; published: number; counted: number }
  | { ok: true; kind: "no-tally" }
  | {
      ok: false;
      kind: "bucket-mismatch";
      message: string;
      diffs: Array<{
        bucket: ParsedPosition;
        published: number;
        counted: number;
      }>;
    }
  | {
      ok: false;
      kind: "total-mismatch";
      message: string;
      published: number;
      counted: number;
    }
  | { ok: false; kind: "malformed-tally"; message: string };

const BUCKETS: ReadonlyArray<{
  bucket: ParsedPosition;
  of: (t: {
    yea: number;
    nay: number;
    present: number;
    notVoting: number;
  }) => number;
}> = [
  { bucket: "yea", of: (t) => t.yea },
  { bucket: "nay", of: (t) => t.nay },
  { bucket: "present", of: (t) => t.present },
  { bucket: "not_voting", of: (t) => t.notVoting },
];

function countPositions(
  positions: ReadonlyArray<{ position: ParsedPosition }>,
): { yea: number; nay: number; present: number; notVoting: number } {
  const counted = { yea: 0, nay: 0, present: 0, notVoting: 0 };
  for (const p of positions) {
    if (p.position === "yea") counted.yea += 1;
    else if (p.position === "nay") counted.nay += 1;
    else if (p.position === "present") counted.present += 1;
    else counted.notVoting += 1;
  }
  return counted;
}

function line(t: {
  yea: number;
  nay: number;
  present: number;
  notVoting: number;
}): string {
  const total = t.yea + t.nay + t.present + t.notVoting;
  return `yea=${t.yea} nay=${t.nay} present=${t.present} not_voting=${t.notVoting} (${total})`;
}

// Compares the chamber's published count against the positions the parser
// produced from the same document. Every bucket is compared independently:
// a total that matches while two buckets are swapped is a failure.
export function verifyTally(
  tally: PublishedTally,
  positions: ReadonlyArray<{ position: ParsedPosition }>,
): TallyVerdict {
  if (tally.kind === "none") return { ok: true, kind: "no-tally" };
  if (tally.kind === "malformed") {
    return { ok: false, kind: "malformed-tally", message: tally.reason };
  }

  if (tally.kind === "total") {
    const counted = positions.length;
    if (tally.total === counted) {
      return {
        ok: true,
        kind: "total-only",
        published: tally.total,
        counted,
      };
    }
    return {
      ok: false,
      kind: "total-mismatch",
      message: `published total ${tally.total}; counted ${counted}`,
      published: tally.total,
      counted,
    };
  }

  const counted = countPositions(positions);
  const diffs = BUCKETS.filter((b) => b.of(tally) !== b.of(counted)).map(
    (b) => ({
      bucket: b.bucket,
      published: b.of(tally),
      counted: b.of(counted),
    }),
  );
  const publishedTotal =
    tally.yea + tally.nay + tally.present + tally.notVoting;
  const countedTotal = positions.length;

  if (diffs.length === 0) {
    return {
      ok: true,
      kind: "verified",
      published: publishedTotal,
      counted: countedTotal,
    };
  }
  return {
    ok: false,
    kind: "bucket-mismatch",
    message:
      `published ${line(tally)}; counted ${line(counted)}; ` +
      `differing buckets: ${diffs.map((d) => d.bucket).join(", ")}`,
    diffs,
  };
}

export type SkipReason = "no-crosswalk" | "not-in-roster";

// Per-roll-call ceiling on attributed skips: it catches the crosswalk
// collapsing wholesale while every lost position is still dutifully named.
// Measured maxima over all 1,573 roll calls on 2026-09-24: House 15,
// Senate 3. The budgets sit one departure-wave above them.
export const COVERAGE_BUDGET: Record<Chamber, number> = {
  house: 20,
  senate: 5,
};

type CoverageFacts = {
  residual: number;
  skippedCount: number;
  budget: number;
  byReason: Record<SkipReason, number>;
};

export type CoverageVerdict =
  | ({ ok: true; reason: "attributed" } & CoverageFacts)
  | ({ ok: false; reason: "unattributed" } & CoverageFacts)
  | ({ ok: false; reason: "over-budget" } & CoverageFacts);

// A known discrepancy is one with a name on it: parsed − stored == skipped,
// every skip carrying a member id and a reason. Anything left over is a
// position that vanished with nobody's name on it, which is the regression
// this whole slice exists to detect. It has no tolerance and no tuning knob.
export function verifyCoverage(input: {
  parsedCount: number;
  storedCount: number;
  skipped: ReadonlyArray<{ memberId: string; reason: SkipReason }>;
  budget: number;
}): CoverageVerdict {
  const byReason: Record<SkipReason, number> = {
    "no-crosswalk": 0,
    "not-in-roster": 0,
  };
  for (const s of input.skipped) byReason[s.reason] += 1;

  const facts: CoverageFacts = {
    residual: input.parsedCount - input.storedCount - input.skipped.length,
    skippedCount: input.skipped.length,
    budget: input.budget,
    byReason,
  };

  if (facts.residual !== 0) return { ok: false, reason: "unattributed", ...facts };
  if (facts.skippedCount > input.budget) {
    return { ok: false, reason: "over-budget", ...facts };
  }
  return { ok: true, reason: "attributed", ...facts };
}

export type ReconciliationVerdict =
  | { ok: true; kind: "matched"; intended: number; stored: number }
  | {
      ok: true;
      kind: "surplus";
      intended: number;
      stored: number;
      surplus: number;
    }
  | {
      ok: false;
      kind: "shortfall";
      intended: number;
      stored: number;
      missing: number;
    };

// Read-back of what a chunked upsert actually landed, against what the run
// intended to write. Deliberately asymmetric:
//
//   stored < intended  a write silently did not land — the failure this check
//                      exists for, and fatal.
//   stored > intended  rows the run did not intend to write. The upsert is
//                      keyed on (rollCallId, legislatorId), so a run cannot
//                      create rows it did not intend: structurally this can
//                      only be history — positions stored by an earlier sync
//                      for a member the current roster can no longer
//                      crosswalk (S293 Graham, S419 Mullin). This slice
//                      deletes nothing, so it is reported, not failed.
export function verifyReconciliation(input: {
  intended: number;
  stored: number;
}): ReconciliationVerdict {
  const { intended, stored } = input;
  if (stored < intended) {
    return { ok: false, kind: "shortfall", intended, stored, missing: intended - stored };
  }
  if (stored > intended) {
    return { ok: true, kind: "surplus", intended, stored, surplus: stored - intended };
  }
  return { ok: true, kind: "matched", intended, stored };
}
