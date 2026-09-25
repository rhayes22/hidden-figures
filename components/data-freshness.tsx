import { sql } from "drizzle-orm";
import { db } from "@/db";
import { assessFreshness, type FreshnessState } from "@/lib/freshness";
import { formatDate } from "@/lib/format";

// Two numbers, because they answer different questions: the latest roll call
// says how recent the legislation is, the last successful sync says whether
// the pipeline is alive. During a recess the first is old and nothing is
// wrong; when the sync breaks the second is old and everything is wrong.
//
// Slice 7 note: this is deliberately the only place either number is read,
// so there is one file to touch. When slice 7 drops `force-dynamic` from the
// list pages, give this read its own cache entry with its own ≤1h lifetime
// and its own tag, invalidated by the ingest — otherwise the footer gets
// pinned to whatever lifetime the page around it acquires. The invariant to
// preserve: the rendered value is never more than an hour older than the
// database.
async function readFreshness(): Promise<FreshnessState> {
  // `next build` prerenders routes without a database (db/index.ts tolerates
  // a missing DATABASE_URL in that phase), and /_not-found cannot be given a
  // `revalidate`, so a build-time value would be baked there forever. Silence
  // for up to an hour after a deploy beats a wrong date that never expires.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return { kind: "unknown" };
  }
  try {
    const result = await db.execute(sql`
      SELECT (SELECT max(vote_date) FROM roll_calls) AS latest_vote,
             (SELECT max(finished_at) FROM sync_runs
               WHERE script = 'votes' AND exit_code = 0) AS last_checked
    `);
    const row = result.rows[0] as
      | { latest_vote: string | null; last_checked: Date | string | null }
      | undefined;
    return assessFreshness({
      latestVoteDate: row?.latest_vote ?? null,
      lastCheckedAt: row?.last_checked ? new Date(row.last_checked) : null,
      now: new Date(),
    });
  } catch {
    // A footer query must never 500 every page on the site. An unverifiable
    // claim is the bug this indicator exists to fix, so a failed read is the
    // same as no data: nothing renders.
    return { kind: "unknown" };
  }
}

export default async function DataFreshness() {
  const state = await readFreshness();
  if (state.kind === "unknown") return null;

  if (state.kind === "stale") {
    return (
      <p className="text-xs text-flag-red">
        ⚠ Data may be out of date — last checked{" "}
        {formatDate(state.checkedDate)} ({state.daysSinceCheck}{" "}
        {state.daysSinceCheck === 1 ? "day" : "days"} ago)
      </p>
    );
  }

  return (
    <p className="text-xs text-gray-500">
      Latest roll call {formatDate(state.latestVoteDate)} · data checked{" "}
      {formatDate(state.checkedDate)}
    </p>
  );
}
