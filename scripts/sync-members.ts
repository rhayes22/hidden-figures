// Syncs the legislators table with the current Congress roster.
// Source: unitedstates/congress-legislators (legislators-current.yaml).
// Idempotent: upserts by bioguide id; members who left office are kept
// with in_office = false so their past votes stay attributed.

import "dotenv/config";
import { notInArray, sql } from "drizzle-orm";
import { parse } from "yaml";
import { db, pool } from "../db";
import { legislators } from "../db/schema";
import { toLegislatorRow, type LegislatorRecord } from "../lib/members";

const SOURCE_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";

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

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const records = parse(await res.text()) as LegislatorRecord[];
  console.log(`Parsed ${records.length} current members of Congress`);

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
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
