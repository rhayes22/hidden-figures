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
