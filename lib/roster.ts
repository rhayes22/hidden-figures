// Size floors on legislators-current.yaml, the one file both sync scripts
// read. A truncated-but-valid parse is the hazard: sync-members would retire
// every member the short file omits, and sync-votes would file every Senate
// position as no-crosswalk — attributed, so slice 3's checks would warn and
// exit 0 while the nightly quietly stopped storing Senate positions.
//
// Pure by design — no database, no network, no script imports — because
// lib/ is the only unit-tested layer (CLAUDE.md, "Conventions"). It returns
// verdicts and never logs, throws or exits; each script decides what a
// verdict means for the run. Same split as lib/tally.ts.

// Measured against the live file on 2026-09-24.
//
//   records          539 today (433 voting House + 100 Senate + 6 non-voting
//                    delegates), structural ceiling 541. 500 tolerates 41
//                    simultaneous vacancies and catches any truncation losing
//                    more than 7% of the file.
//   senate-crosswalk exactly 100 senators, all 100 carrying an id.lis. This is
//                    a different failure from truncation: if the upstream
//                    project renames or drops id.lis wholesale the record
//                    count stays 539 and the crosswalk collapses on its own.
//                    90 tolerates ten missing ids and catches a collapse.
//
// Deliberately not readable from the environment (slice 3, decision 3): a
// threshold the cron can raise is a threshold that gets raised at 2am.
export const ROSTER_FLOOR: Record<"records" | "senate-crosswalk", number> = {
  records: 500,
  "senate-crosswalk": 90,
};

export type RosterCheck =
  | { kind: "records"; count: number }
  | { kind: "senate-crosswalk"; count: number };

export type RosterVerdict =
  | { ok: true; kind: RosterCheck["kind"]; count: number; floor: number }
  | {
      ok: false;
      kind: RosterCheck["kind"];
      count: number;
      floor: number;
      message: string;
    };

const LABEL: Record<RosterCheck["kind"], string> = {
  records: "parsed roster records",
  "senate-crosswalk": "LIS → bioguide crosswalk entries",
};

// The predicate is `count < floor`, so a count exactly at the floor passes.
export function verifyRosterSize(check: RosterCheck): RosterVerdict {
  const floor = ROSTER_FLOOR[check.kind];
  const { kind, count } = check;
  if (count < floor) {
    return {
      ok: false,
      kind,
      count,
      floor,
      message: `${count} ${LABEL[kind]} is below the floor of ${floor}`,
    };
  }
  return { ok: true, kind, count, floor };
}
