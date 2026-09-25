// Decides what the site should say about how fresh its data is, from two
// numbers that answer two different questions: the latest roll call says how
// recent the *legislation* is, the last successful sync says whether the
// *pipeline* is alive. During a recess the first is old and nothing is wrong;
// when the sync breaks the second is old and everything is wrong.
//
// Pure by design — no database, no clock — because lib/ is the only
// unit-tested layer (CLAUDE.md, "Conventions"). `now` is injected so the
// tests do not depend on the wall clock.

// The nightly runs at 06:17 UTC, so a healthy value is already up to ~24h old
// just before the next run and a single missed or queue-delayed night reaches
// ~48. A threshold of 24 or 36 would put a warning on the live site for a
// delay that needs no human. At 48, two consecutive failures raise it — the
// first point at which something is actually wrong.
export const STALE_AFTER_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type FreshnessState =
  // `checkedDate` and `latestVoteDate` are both YYYY-MM-DD in UTC, ready for
  // formatDate. Absolute, not relative: these pages are cached for up to an
  // hour, and "checked 5 hours ago" rots inside a cache entry.
  | { kind: "current"; latestVoteDate: string; checkedDate: string }
  | { kind: "stale"; checkedDate: string; daysSinceCheck: number }
  | { kind: "unknown" };

function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function assessFreshness(input: {
  latestVoteDate: string | null;
  lastCheckedAt: Date | null;
  now: Date;
}): FreshnessState {
  const { latestVoteDate, lastCheckedAt, now } = input;
  // No successful sync on record, so there is nothing we can vouch for; and
  // with no roll calls there is nothing to be current *about*. Either way the
  // honest output is silence rather than a claim we cannot verify.
  if (lastCheckedAt === null) return { kind: "unknown" };

  const ageMs = now.getTime() - lastCheckedAt.getTime();
  if (ageMs >= STALE_AFTER_HOURS * HOUR_MS) {
    return {
      kind: "stale",
      checkedDate: utcDate(lastCheckedAt),
      // Floor of full days, so an hour of cache staleness cannot move the
      // number by more than one day at a boundary.
      daysSinceCheck: Math.floor(ageMs / DAY_MS),
    };
  }

  if (latestVoteDate === null) return { kind: "unknown" };
  return {
    kind: "current",
    latestVoteDate,
    checkedDate: utcDate(lastCheckedAt),
  };
}
