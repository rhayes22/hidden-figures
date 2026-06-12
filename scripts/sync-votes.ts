// Syncs recent roll calls from both chambers into roll_calls + vote_positions,
// creating bills rows (with real titles from Congress.gov) for linked bills.
// Idempotent: everything upserts by natural id. Usage:
//   npm run sync:votes            # latest 30 per chamber
//   npm run sync:votes -- 50      # latest 50 per chamber

import "dotenv/config";
import { sql } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { db, pool } from "../db";
import { bills, legislators, rollCalls, votePositions } from "../db/schema";
import { parseBillId } from "../lib/ids";
import type { LegislatorRecord } from "../lib/members";
import {
  congressForYear,
  parseHouseVote,
  parseSenateVote,
  parseSenateVoteMenu,
  sessionForYear,
  type ParsedRollCall,
} from "../lib/votes";

// Usage: npm run sync:votes [-- <votesPerChamber> [<year>]]
//   npm run sync:votes               # latest 30 per chamber, current year
//   npm run sync:votes -- 1200 2025  # backfill a whole prior session
const VOTES_PER_CHAMBER = Number(process.argv[2] ?? 30);
const YEAR = Number(process.argv[3] ?? new Date().getFullYear());
const CONGRESS = congressForYear(YEAR);
const SESSION = sessionForYear(YEAR);
const LEGISLATORS_YAML =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "user-agent": "hidden-figures (github.com/rhayes22/hidden-figures)" },
  });
  if (!res.ok) return null;
  return res.text();
}

// --- House: probe for the latest roll number, then walk backwards ---

function houseUrl(roll: number): string {
  return `https://clerk.house.gov/evs/${YEAR}/roll${String(roll).padStart(3, "0")}.xml`;
}

async function houseRollExists(roll: number): Promise<boolean> {
  const text = await fetchText(houseUrl(roll));
  return text !== null && text.includes("<rollcall-vote");
}

async function findLatestHouseRoll(): Promise<number> {
  let hi = 1;
  while (await houseRollExists(hi * 2)) hi *= 2;
  let lo = hi;
  hi = hi * 2;
  // invariant: lo exists, hi doesn't
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (await houseRollExists(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Fetch + parse a list of vote URLs in polite parallel batches. senate.gov
// rate-limits aggressive clients (403s), so keep batches small, pause between
// them, and report failures loudly — a silent gap is worse than a slow sync.
async function fetchVotesBatched(
  urls: string[],
  parse: (xml: string) => ParsedRollCall,
): Promise<ParsedRollCall[]> {
  const BATCH = 5;
  const PAUSE_MS = 400;
  const out: ParsedRollCall[] = [];
  let failed = 0;
  for (let i = 0; i < urls.length; i += BATCH) {
    const texts = await Promise.all(
      urls.slice(i, i + BATCH).map((u) => fetchText(u)),
    );
    for (const xml of texts) {
      if (xml) out.push(parse(xml));
      else failed += 1;
    }
    if (i + BATCH < urls.length) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }
  if (failed > 0) {
    console.warn(
      `⚠ ${failed} of ${urls.length} vote fetches failed (likely rate-limited) — re-run later to fill the gap`,
    );
  }
  return out;
}

async function fetchHouseVotes(): Promise<ParsedRollCall[]> {
  if (!(await houseRollExists(1))) {
    console.warn(`No House votes found for ${YEAR}`);
    return [];
  }
  const latest = await findLatestHouseRoll();
  console.log(`House: latest roll call is #${latest}`);
  const urls = [];
  for (let r = latest; r > Math.max(0, latest - VOTES_PER_CHAMBER); r--) {
    urls.push(houseUrl(r));
  }
  return fetchVotesBatched(urls, parseHouseVote);
}

// --- Senate: the menu lists every vote of the session ---

async function fetchSenateVotes(): Promise<ParsedRollCall[]> {
  const menuXml = await fetchText(
    `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${CONGRESS}_${SESSION}.xml`,
  );
  if (!menuXml) {
    console.warn("Senate vote menu not found");
    return [];
  }
  const numbers = parseSenateVoteMenu(menuXml)
    .sort((a, b) => b - a)
    .slice(0, VOTES_PER_CHAMBER);
  console.log(`Senate: latest roll call is #${numbers[0] ?? "none"}`);
  const urls = numbers.map(
    (n) =>
      `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CONGRESS}${SESSION}/vote_${CONGRESS}_${SESSION}_${String(n).padStart(5, "0")}.xml`,
  );
  return fetchVotesBatched(urls, parseSenateVote);
}

// --- Senate LIS id -> bioguide id crosswalk ---

async function lisToBioguide(): Promise<Map<string, string>> {
  const yaml = await fetchText(LEGISLATORS_YAML);
  if (!yaml) throw new Error("Could not fetch legislators-current.yaml");
  const records = parseYaml(yaml) as LegislatorRecord[];
  const map = new Map<string, string>();
  for (const rec of records) {
    if (rec.id.lis) map.set(rec.id.lis, rec.id.bioguide);
  }
  return map;
}

// --- Bills: create rows with real titles from Congress.gov ---

type BillRow = typeof bills.$inferInsert;

async function fetchBillRow(id: string, apiKey: string): Promise<BillRow> {
  const { billType, number, congress } = parseBillId(id);
  const res = await fetch(
    `https://api.congress.gov/v3/bill/${congress}/${billType}/${number}?format=json&api_key=${apiKey}`,
  );
  const bill = res.ok
    ? (
        (await res.json()) as {
          bill?: {
            title?: string;
            latestAction?: { actionDate?: string; text?: string };
          };
        }
      ).bill
    : null;
  if (!res.ok) {
    console.warn(`Congress.gov ${res.status} for ${id}; using placeholder title`);
  }
  return {
    id,
    congress,
    billType,
    number,
    title: bill?.title ?? `${billType.toUpperCase()} ${number}`,
    status: bill?.latestAction?.text ?? null,
    latestActionDate: bill?.latestAction?.actionDate ?? null,
  };
}

async function upsertBills(billIds: string[]): Promise<void> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_GOV_API_KEY is not set");
  if (billIds.length === 0) return;

  // Fetch titles in parallel batches (rate limit is 5,000/hr), then one upsert.
  const BATCH = 12;
  const rows: BillRow[] = [];
  for (let i = 0; i < billIds.length; i += BATCH) {
    const batch = billIds.slice(i, i + BATCH);
    rows.push(...(await Promise.all(batch.map((id) => fetchBillRow(id, apiKey)))));
  }

  await db
    .insert(bills)
    .values(rows)
    .onConflictDoUpdate({
      target: bills.id,
      set: {
        title: sql`excluded.title`,
        status: sql`excluded.status`,
        latestActionDate: sql`excluded.latest_action_date`,
      },
    });
}

// --- Main ---

async function main() {
  console.log(`Syncing latest ${VOTES_PER_CHAMBER} roll calls per chamber (${CONGRESS}th Congress, session ${SESSION})`);

  const [houseVotes, senateVotes, crosswalk] = await Promise.all([
    fetchHouseVotes(),
    fetchSenateVotes(),
    lisToBioguide(),
  ]);
  const votes = [...houseVotes, ...senateVotes];
  console.log(`Parsed ${houseVotes.length} House + ${senateVotes.length} Senate roll calls`);

  // Senate positions are keyed by LIS id — translate to bioguide.
  for (const vote of senateVotes) {
    vote.positions = vote.positions.flatMap((p) => {
      const bioguide = crosswalk.get(p.memberId);
      if (!bioguide) {
        console.warn(`No bioguide for LIS ${p.memberId} (${vote.id}); skipping`);
        return [];
      }
      return [{ ...p, memberId: bioguide }];
    });
  }

  // Bills first (FK target), then roll calls, then positions.
  const billIds = [...new Set(votes.map((v) => v.billId).filter((b): b is string => b !== null))];
  console.log(`Fetching titles for ${billIds.length} linked bills from Congress.gov`);
  await upsertBills(billIds);

  await db
    .insert(rollCalls)
    .values(
      votes.map((v) => ({
        id: v.id,
        chamber: v.chamber,
        congress: v.congress,
        session: v.session,
        rollNumber: v.rollNumber,
        voteDate: v.voteDate,
        question: v.question,
        result: v.result,
        billId: v.billId,
      })),
    )
    .onConflictDoUpdate({
      target: rollCalls.id,
      set: { result: sql`excluded.result`, billId: sql`excluded.bill_id` },
    });

  // Positions for members we don't track (e.g. someone who left office
  // earlier this year and is gone from legislators-current) are skipped.
  const known = new Set(
    (await db.select({ id: legislators.id }).from(legislators)).map((r) => r.id),
  );
  const positionRows = votes.flatMap((vote) =>
    vote.positions
      .filter((p) => known.has(p.memberId))
      .map((p) => ({
        rollCallId: vote.id,
        legislatorId: p.memberId,
        position: p.position,
      })),
  );
  const skipped =
    votes.reduce((n, v) => n + v.positions.length, 0) - positionRows.length;

  for (let i = 0; i < positionRows.length; i += 2000) {
    const chunk = positionRows.slice(i, i + 2000);
    await db
      .insert(votePositions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [votePositions.rollCallId, votePositions.legislatorId],
        set: { position: sql`excluded.position` },
      });
  }
  console.log(`Upserted ${positionRows.length} vote positions (${skipped} for untracked members skipped)`);

  const counts = await db.execute(sql`
    SELECT chamber, count(*)::int AS roll_calls, min(vote_date) AS oldest, max(vote_date) AS newest
    FROM roll_calls GROUP BY chamber ORDER BY chamber
  `);
  console.log("roll_calls by chamber:", counts.rows);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
