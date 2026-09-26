// Fills bills.summary from Congress.gov for bills the nightly cannot reach.
//
// This script is structural, not a convenience. scripts/sync-votes.ts only
// upserts bills reachable from the latest 75 roll calls per chamber, so a bill
// whose last roll call was in January 2025 is never revisited and its summary
// would stay NULL forever. The nightly keeps current bills fresh; this walks
// the whole table once.
//
// Reads bill ids from the database and calls only api.congress.gov — never
// clerk.house.gov or senate.gov. Measured over all 509 bills on 2026-09-25:
// 509 requests, 87 seconds, 2.5% of the measured 20,000/hr limit.
//
// Idempotent: the same coalesce upsert as the nightly, so re-running produces
// the same rows. It writes bills.summary and nothing else — not title, status,
// latest_action_date or short_title, and no other table.
//
// In particular it writes NO sync_runs row. sync_runs means "a scheduled
// ingest ran": the site footer and the 48-hour stale alarm read it, and
// production already carries four rows that are not real CI runs (ids 1, 7, 8,
// 9). A hand-run backfill must not add a fifth.
//
// Usage:
//   npm run backfill:summaries          # every congress present in bills
//   npm run backfill:summaries -- 118   # one congress

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { bills } from "../db/schema";
import { summaryTextFor, type ApiSummary } from "../lib/bill-summary";

// Optional congress filter; absent means every congress present in bills.
// Slice 16 ("Historical bill metadata") runs exactly this against the 117th
// and 118th, which is why it is an argument rather than a constant.
const CONGRESS = process.argv[2] ? Number(process.argv[2]) : null;

// The same fetch discipline as the chamber feeds: small batches, a pause
// between them. Measured at 87 seconds for 509 bills.
const BATCH = 5;
const PAUSE_MS = 250;
// One retry on any failure: 10 of 509 summary requests (2.0%) returned HTTP
// 503 on first attempt in the 2026-09-25 sweep, and all ten succeeded on a
// plain retry. A reset socket and a bad body get the same second chance.
const RETRY_MS = 500;

type BillRow = {
  id: string;
  congress: number;
  billType: string;
  number: number;
  title: string;
};

// What one bill's request produced. "empty" is not a failure: 53 of 509 bills
// have no CRS summary at all, concentrated in simple resolutions.
type Outcome =
  | { kind: "written"; row: BillRow; summary: string }
  | { kind: "empty"; row: BillRow }
  | { kind: "failed"; row: BillRow; reason: string };

// A non-ok status is only one of three ordinary ways a request fails: fetch()
// itself rejects on a connection reset, a DNS blip or a TLS failure, and
// res.json() throws when a 200 carries an edge cache's HTML error page. All
// three are the same outcome here — one bill without a summary, named in the
// summary block and counted toward exit 2 — and none may escape into the
// Promise.all below, which would abandon a run partway through with nothing
// written and nothing reported.
//
// The api key is masked out of the reason: this script's failure lines are
// read from a terminal today, but the same string shape reaches a workflow
// annotation on a public repo in scripts/sync-votes.ts, and a res.json()
// SyntaxError embeds the first bytes of the response body — an edge error page
// that echoes the request URL would otherwise print the key. The empty check
// is load-bearing: replaceAll("") inserts the mask between every character.
function failureReason(err: unknown, apiKey: string): string {
  const reason =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return apiKey ? reason.replaceAll(apiKey, "***") : reason;
}

async function fetchSummary(row: BillRow, apiKey: string): Promise<Outcome> {
  // limit=250 is required, not cosmetic — the default page size is 20, and
  // the sibling /titles endpoint was measured truncating at 20 of 37 for
  // s-2296-119. Summaries top out at 5 today, so the cap costs nothing.
  const url = `https://api.congress.gov/v3/bill/${row.congress}/${row.billType}/${row.number}/summaries?format=json&limit=250&api_key=${apiKey}`;
  let reason = "no response";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_MS));
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as { summaries?: ApiSummary[] };
        const summary = summaryTextFor(body.summaries ?? []);
        return summary === null
          ? { kind: "empty", row }
          : { kind: "written", row, summary };
      }
      reason = `HTTP ${res.status}`;
    } catch (err) {
      reason = failureReason(err, apiKey);
    }
  }
  return { kind: "failed", row, reason };
}

function num(value: number): string {
  return value.toLocaleString("en-US");
}

const LIST_LIMIT = 12;

function truncatedList(items: readonly string[]): string {
  const shown = items.slice(0, LIST_LIMIT).join(", ");
  return items.length > LIST_LIMIT
    ? `${shown}, … (+${items.length - LIST_LIMIT} more)`
    : shown;
}

async function main(): Promise<number> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_GOV_API_KEY is not set");

  const result = await db.execute(sql`
    SELECT id, congress, bill_type AS "billType", number, title
    FROM bills
    ${CONGRESS === null ? sql`` : sql`WHERE congress = ${CONGRESS}`}
    ORDER BY congress, bill_type, number
  `);
  const rows = result.rows as unknown as BillRow[];
  console.log(
    `Backfilling summaries for ${num(rows.length)} bills` +
      `${CONGRESS === null ? " across every congress in bills" : ` in the ${CONGRESS}th Congress`}`,
  );
  if (rows.length === 0) return 0;

  const outcomes: Outcome[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    outcomes.push(
      ...(await Promise.all(
        rows.slice(i, i + BATCH).map((row) => fetchSummary(row, apiKey)),
      )),
    );
    if (i + BATCH < rows.length) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  // The same upsert as scripts/sync-votes.ts. Every id came from the table, so
  // the conflict branch always fires and only `summary` is written — the
  // inserted title/status/date values are never reached.
  const written = outcomes.filter(
    (o): o is Extract<Outcome, { kind: "written" }> => o.kind === "written",
  );
  for (let i = 0; i < written.length; i += 500) {
    const chunk = written.slice(i, i + 500);
    await db
      .insert(bills)
      .values(
        chunk.map((o) => ({
          id: o.row.id,
          congress: o.row.congress,
          billType: o.row.billType,
          number: o.row.number,
          title: o.row.title,
          summary: o.summary,
        })),
      )
      .onConflictDoUpdate({
        target: bills.id,
        set: { summary: sql`coalesce(excluded.summary, "bills"."summary")` },
      });
  }

  const empty = outcomes.filter((o) => o.kind === "empty");
  const failed = outcomes.filter(
    (o): o is Extract<Outcome, { kind: "failed" }> => o.kind === "failed",
  );

  for (const f of failed) {
    console.error(
      `✗ ${f.row.id} — Congress.gov failed twice (${f.reason})\n` +
        `  → no summary written; any stored summary is preserved`,
    );
  }

  console.log(
    [
      `Bill summaries — ${num(rows.length)} bills considered`,
      `  written           ${String(num(written.length)).padStart(5)}   summary stored`,
      `  no summary        ${String(num(empty.length)).padStart(5)}   Congress.gov published none — not a failure`,
      `  failed            ${String(num(failed.length)).padStart(5)}   ${
        failed.length > 0
          ? `⚠ request failed after a retry: ${truncatedList(failed.map((f) => f.row.id))}`
          : "every request answered"
      }`,
    ].join("\n"),
  );

  // Exit 2, not 1: "the script ran and the data is incomplete", distinct from
  // a crash. A bill Congress.gov reports zero summaries for is not a failure.
  return failed.length > 0 ? 2 : 0;
}

main()
  .then(async (exitCode) => {
    await pool.end();
    if (exitCode !== 0) process.exit(exitCode);
  })
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
