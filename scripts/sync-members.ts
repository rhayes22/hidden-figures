// Syncs the legislators table with the current Congress roster.
// Source: unitedstates/congress-legislators (legislators-current.yaml).
// Idempotent: upserts by bioguide id; members who left office are kept
// with in_office = false so their past votes stay attributed.

import "dotenv/config";
import { notInArray, sql } from "drizzle-orm";
import { parse } from "yaml";
import { db, pool } from "../db";
import { legislators, syncRuns } from "../db/schema";
import { toLegislatorRow, type LegislatorRecord } from "../lib/members";
import { verifyRosterSize } from "../lib/roster";

const SOURCE_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";
const STARTED_AT = new Date();
const GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === "true";

// Workflow commands surface a failure as an annotation on the job, so a red
// run says what broke without anyone opening the log. Mirrors the helper in
// sync-votes.ts.
function annotate(level: "error" | "warning", title: string, message: string): void {
  if (!GITHUB_ACTIONS) return;
  console.log(`::${level} title=${title}::${message}`);
}

// Sponsorship counts from the Congress.gov member endpoint. Best-effort:
// returns nulls on any failure so the core member sync never breaks.
async function fetchSponsorship(
  bioguide: string,
  apiKey: string,
): Promise<{ sponsored: number | null; cosponsored: number | null }> {
  try {
    const res = await fetch(
      `https://api.congress.gov/v3/member/${bioguide}?format=json&api_key=${apiKey}`,
    );
    if (!res.ok) return { sponsored: null, cosponsored: null };
    const member = (
      (await res.json()) as {
        member?: {
          sponsoredLegislation?: { count?: number };
          cosponsoredLegislation?: { count?: number };
        };
      }
    ).member;
    return {
      sponsored: member?.sponsoredLegislation?.count ?? null,
      cosponsored: member?.cosponsoredLegislation?.count ?? null,
    };
  } catch {
    return { sponsored: null, cosponsored: null };
  }
}

// Populate sponsorship counts in batches to stay polite to the API.
async function addSponsorshipCounts(
  rows: Array<{ id: string; billsSponsored?: number | null; billsCosponsored?: number | null }>,
  apiKey: string,
): Promise<number> {
  const BATCH = 10;
  let filled = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        const { sponsored, cosponsored } = await fetchSponsorship(row.id, apiKey);
        row.billsSponsored = sponsored;
        row.billsCosponsored = cosponsored;
        if (sponsored !== null) filled += 1;
      }),
    );
  }
  return filled;
}

async function main(): Promise<number> {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const records = parse(await res.text()) as LegislatorRecord[];
  console.log(`Parsed ${records.length} current members of Congress`);

  // The floor runs here: before the sponsorship fetch, before the upsert, and
  // above all before the notInArray update below, which would retire every
  // sitting member a truncated-but-valid parse failed to mention. Nothing is
  // written and no Congress.gov requests are made on a breach.
  const verdict = verifyRosterSize({ kind: "records", count: records.length });
  if (!verdict.ok) {
    console.error(
      `✗ roster ${verdict.kind} — ${verdict.message}\n` +
        `  source: ${SOURCE_URL}\n` +
        `  → nothing written this run`,
    );
    annotate("error", "Roster size below floor", `${verdict.kind} — ${verdict.message}`);
    return 2;
  }

  const rows = records
    .map(toLegislatorRow)
    .filter((row) => row !== null);
  const skipped = records.length - rows.length;
  console.log(`Mapped ${rows.length} voting members (${skipped} non-voting skipped)`);

  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (apiKey) {
    process.stdout.write("Fetching sponsorship counts from Congress.gov ... ");
    const filled = await addSponsorshipCounts(rows, apiKey);
    console.log(`${filled}/${rows.length} populated`);
  } else {
    console.warn("CONGRESS_GOV_API_KEY not set — skipping sponsorship counts");
  }

  await db
    .insert(legislators)
    .values(rows)
    .onConflictDoUpdate({
      target: legislators.id,
      set: {
        fullName: sql`excluded.full_name`,
        party: sql`excluded.party`,
        state: sql`excluded.state`,
        district: sql`excluded.district`,
        chamber: sql`excluded.chamber`,
        inOffice: sql`excluded.in_office`,
        photoUrl: sql`excluded.photo_url`,
        termStart: sql`excluded.term_start`,
        termEnd: sql`excluded.term_end`,
        memberSince: sql`excluded.member_since`,
        billsSponsored: sql`excluded.bills_sponsored`,
        billsCosponsored: sql`excluded.bills_cosponsored`,
      },
    });

  // Roster churn: anyone in the table but no longer in the source file
  // has left office.
  const departed = await db
    .update(legislators)
    .set({ inOffice: false })
    .where(
      notInArray(
        legislators.id,
        rows.map((row) => row.id),
      ),
    )
    .returning({ id: legislators.id });
  if (departed.length > 0) {
    console.log(`Marked ${departed.length} departed member(s): ${departed.map((d) => d.id).join(", ")}`);
  }

  const counts = await db.execute(sql`
    SELECT chamber, count(*)::int AS members
    FROM legislators
    WHERE in_office
    GROUP BY chamber
    ORDER BY chamber
  `);
  console.log("In-office members by chamber:", counts.rows);
  return 0;
}

main()
  .then(async (exitCode) => {
    // One row per run, recording the code the run is about to exit with —
    // including a non-zero one. A run that throws records nothing, which is
    // itself detectable as a missing row.
    await db.insert(syncRuns).values({
      script: "members",
      startedAt: STARTED_AT,
      finishedAt: new Date(),
      exitCode,
    });
    await pool.end();
    if (exitCode !== 0) process.exit(exitCode);
  })
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
