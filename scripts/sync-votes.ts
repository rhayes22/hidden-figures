// Syncs recent roll calls from both chambers into roll_calls + vote_positions,
// creating bills rows (with real titles from Congress.gov) for linked bills.
// Idempotent: everything upserts by natural id. Usage:
//   npm run sync:votes            # latest 30 per chamber
//   npm run sync:votes -- 50      # latest 50 per chamber

import "dotenv/config";
import { appendFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { db, pool } from "../db";
import { bills, legislators, rollCalls, votePositions } from "../db/schema";
import { parseBillId } from "../lib/ids";
import type { LegislatorRecord } from "../lib/members";
import {
  COVERAGE_BUDGET,
  verifyCoverage,
  verifyReconciliation,
  verifyTally,
  type SkipReason,
  type TallyVerdict,
} from "../lib/tally";
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

// What a chamber's fetch produced, alongside how much of it never arrived.
// The count is carried out rather than left local because a run that fetched
// half the corpus — or none of it — otherwise reads exactly like a clean run
// that had less to do.
type FetchResult = { votes: ParsedRollCall[]; failed: number };

// Fetch + parse a list of vote URLs in polite parallel batches. senate.gov
// rate-limits aggressive clients (403s), so keep batches small, pause between
// them, and report failures loudly — a silent gap is worse than a slow sync.
async function fetchVotesBatched(
  urls: string[],
  parse: (xml: string) => ParsedRollCall,
): Promise<FetchResult> {
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
    annotate(
      "warning",
      "Vote fetches failed",
      `${failed} of ${urls.length} vote documents never arrived (likely rate-limited) — re-run later to fill the gap`,
    );
  }
  return { votes: out, failed };
}

async function fetchHouseVotes(): Promise<FetchResult> {
  if (!(await houseRollExists(1))) {
    console.warn(`No House votes found for ${YEAR}`);
    return { votes: [], failed: 0 };
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

function senateUrl(roll: number): string {
  return `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CONGRESS}${SESSION}/vote_${CONGRESS}_${SESSION}_${String(roll).padStart(5, "0")}.xml`;
}

async function fetchSenateVotes(): Promise<FetchResult & { menuUnavailable: boolean }> {
  const menuXml = await fetchText(
    `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${CONGRESS}_${SESSION}.xml`,
  );
  if (!menuXml) {
    console.warn("Senate vote menu not found");
    annotate(
      "warning",
      "Senate vote menu unavailable",
      `no Senate roll calls could be fetched for the ${CONGRESS}th Congress, session ${SESSION} — this run covers the House only`,
    );
    return { votes: [], failed: 0, menuUnavailable: true };
  }
  const numbers = parseSenateVoteMenu(menuXml)
    .sort((a, b) => b - a)
    .slice(0, VOTES_PER_CHAMBER);
  console.log(`Senate: latest roll call is #${numbers[0] ?? "none"}`);
  const urls = numbers.map((n) => senateUrl(n));
  return { ...(await fetchVotesBatched(urls, parseSenateVote)), menuUnavailable: false };
}

// --- Roster: the LIS -> bioguide crosswalk, plus surnames for the summary ---

type Roster = {
  // LIS id -> bioguide id, for Senate positions.
  crosswalk: Map<string, string>;
  // Either id -> surname, so the summary block names who is missing rather
  // than printing a count. Members who left the roster entirely have no
  // entry, and are reported by id alone.
  names: Map<string, string>;
};

async function loadRoster(): Promise<Roster> {
  const yaml = await fetchText(LEGISLATORS_YAML);
  if (!yaml) throw new Error("Could not fetch legislators-current.yaml");
  const records = parseYaml(yaml) as LegislatorRecord[];
  const crosswalk = new Map<string, string>();
  const names = new Map<string, string>();
  for (const rec of records) {
    if (rec.id.lis) {
      crosswalk.set(rec.id.lis, rec.id.bioguide);
      names.set(rec.id.lis, rec.name.last);
    }
    names.set(rec.id.bioguide, rec.name.last);
  }
  return { crosswalk, names };
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

// --- Verification reporting ---

const GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === "true";

// Workflow commands surface a failure as an annotation on the job, so a red
// run says what broke without anyone opening the log. Additive: the plain
// text below is printed in both environments either way.
function annotate(level: "error" | "warning", title: string, message: string): void {
  if (!GITHUB_ACTIONS) return;
  console.log(`::${level} title=${title}::${message}`);
}

function sourceUrl(vote: ParsedRollCall): string {
  return vote.chamber === "house"
    ? houseUrl(vote.rollNumber)
    : senateUrl(vote.rollNumber);
}

type Skip = { memberId: string; reason: SkipReason };

// One line names what is missing instead of counting it, truncated so a wide
// failure cannot bury the rest of the block.
const LIST_LIMIT = 12;

function truncatedList(items: readonly string[]): string {
  const shown = items.slice(0, LIST_LIMIT).join(", ");
  return items.length > LIST_LIMIT
    ? `${shown}, … (+${items.length - LIST_LIMIT} more)`
    : shown;
}

// Distinct ids in first-seen order, named where the roster knows them.
function nameList(
  skips: readonly Skip[],
  reason: SkipReason,
  names: Map<string, string>,
): string {
  const ids = [
    ...new Set(skips.filter((s) => s.reason === reason).map((s) => s.memberId)),
  ];
  return truncatedList(
    ids.map((id) => {
      const name = names.get(id);
      return name ? `${id} ${name}` : id;
    }),
  );
}

function num(value: number): string {
  return value.toLocaleString("en-US");
}

// --- Main ---

async function main(): Promise<number> {
  console.log(`Syncing latest ${VOTES_PER_CHAMBER} roll calls per chamber (${CONGRESS}th Congress, session ${SESSION})`);

  const [house, senate, roster] = await Promise.all([
    fetchHouseVotes(),
    fetchSenateVotes(),
    loadRoster(),
  ]);
  const houseVotes = house.votes;
  const senateVotes = senate.votes;
  // Documents that never arrived. Not fatal (decision 8: rate limiting is
  // transient and self-heals), but the summary must say so — otherwise a run
  // that fetched half the corpus reads as a clean run over a smaller corpus.
  const fetchFailures = house.failed + senate.failed;
  const votes = [...houseVotes, ...senateVotes];
  console.log(`Parsed ${houseVotes.length} House + ${senateVotes.length} Senate roll calls`);

  // Tally verification runs here: against the positions exactly as the
  // parsers produced them, before the LIS crosswalk and before the roster
  // filter. That ordering is the whole reason the assertion can be exact —
  // moving it after either step would force a tolerance that hides the next
  // real bug.
  const tallyVerdicts = new Map<string, TallyVerdict>();
  const quarantined = new Set<string>();
  for (const vote of votes) {
    const verdict = verifyTally(vote.tally, vote.positions);
    tallyVerdicts.set(vote.id, verdict);
    if (verdict.ok) continue;
    quarantined.add(vote.id);
    console.error(
      `✗ ${vote.id} ${verdict.kind} — ${verdict.message}\n` +
        `  source: ${sourceUrl(vote)}\n` +
        `  → quarantined, not written`,
    );
    annotate("error", "Tally verification failed", `${vote.id} — ${verdict.kind}`);
  }

  const parsedCounts = new Map(votes.map((v) => [v.id, v.positions.length]));
  const skips = new Map<string, Skip[]>(votes.map((v) => [v.id, []]));

  // Senate positions are keyed by LIS id — translate to bioguide.
  for (const vote of senateVotes) {
    const dropped = skips.get(vote.id)!;
    vote.positions = vote.positions.flatMap((p) => {
      const bioguide = roster.crosswalk.get(p.memberId);
      if (!bioguide) {
        console.warn(`No bioguide for LIS ${p.memberId} (${vote.id}); skipping`);
        dropped.push({ memberId: p.memberId, reason: "no-crosswalk" });
        return [];
      }
      return [{ ...p, memberId: bioguide }];
    });
  }

  // A roll call whose published tally and parsed positions disagree is not
  // written at all: its positions are the thing we cannot vouch for.
  const writable = votes.filter((v) => !quarantined.has(v.id));

  // Bills first (FK target), then roll calls, then positions.
  const billIds = [...new Set(writable.map((v) => v.billId).filter((b): b is string => b !== null))];
  console.log(`Fetching titles for ${billIds.length} linked bills from Congress.gov`);
  await upsertBills(billIds);

  if (writable.length > 0) {
    await db
      .insert(rollCalls)
      .values(
        writable.map((v) => ({
          id: v.id,
          chamber: v.chamber,
          congress: v.congress,
          session: v.session,
          rollNumber: v.rollNumber,
          voteDate: v.voteDate,
          question: v.question,
          result: v.result,
          description: v.description,
          resultText: v.resultText,
          billId: v.billId,
          // A candidate tally (the Speaker election) has no yea/nay shape
          // and no column to live in, so all four stay null together.
          publishedYea: v.tally.kind === "buckets" ? v.tally.yea : null,
          publishedNay: v.tally.kind === "buckets" ? v.tally.nay : null,
          publishedPresent: v.tally.kind === "buckets" ? v.tally.present : null,
          publishedNotVoting: v.tally.kind === "buckets" ? v.tally.notVoting : null,
        })),
      )
      .onConflictDoUpdate({
        target: rollCalls.id,
        set: {
          result: sql`excluded.result`,
          description: sql`excluded.description`,
          resultText: sql`excluded.result_text`,
          billId: sql`excluded.bill_id`,
          // coalesce, not a bare excluded.*: a chamber renaming or re-nesting
          // its tally element parses as *absence* (kind "none"), which is an
          // ok verdict, so an unconditional write would quietly replace
          // verified numbers with NULL on every re-sync — and the criterion-G
          // invariant query skips NULL rows, so the loss would hide itself.
          // A roll call that genuinely has no published tally has nothing
          // stored to preserve, so it still lands as NULL.
          publishedYea: sql`coalesce(excluded.published_yea, "roll_calls"."published_yea")`,
          publishedNay: sql`coalesce(excluded.published_nay, "roll_calls"."published_nay")`,
          publishedPresent: sql`coalesce(excluded.published_present, "roll_calls"."published_present")`,
          publishedNotVoting: sql`coalesce(excluded.published_not_voting, "roll_calls"."published_not_voting")`,
        },
      });
  }

  // Positions for members we don't track (e.g. someone who left office
  // earlier this year and is gone from legislators-current) are skipped —
  // each one by name, so the shortfall is attributable rather than silent.
  const known = new Set(
    (await db.select({ id: legislators.id }).from(legislators)).map((r) => r.id),
  );
  const positionRows: Array<typeof votePositions.$inferInsert> = [];
  const intended = new Map<string, number>();
  for (const vote of writable) {
    const dropped = skips.get(vote.id)!;
    let rows = 0;
    for (const p of vote.positions) {
      if (!known.has(p.memberId)) {
        dropped.push({ memberId: p.memberId, reason: "not-in-roster" });
        continue;
      }
      positionRows.push({
        rollCallId: vote.id,
        legislatorId: p.memberId,
        position: p.position,
      });
      rows += 1;
    }
    intended.set(vote.id, rows);
  }

  let unattributed = 0;
  let overBudget = 0;
  for (const vote of writable) {
    const dropped = skips.get(vote.id)!;
    const verdict = verifyCoverage({
      parsedCount: parsedCounts.get(vote.id)!,
      storedCount: intended.get(vote.id)!,
      skipped: dropped,
      budget: COVERAGE_BUDGET[vote.chamber],
    });
    if (verdict.reason === "unattributed") {
      unattributed += Math.abs(verdict.residual);
      console.error(
        `✗ ${vote.id} unattributed — parsed ${parsedCounts.get(vote.id)}, ` +
          `to store ${intended.get(vote.id)}, attributed ${verdict.skippedCount}, ` +
          `residual ${verdict.residual}\n` +
          `  source: ${sourceUrl(vote)}\n` +
          `  → positions vanished with nobody's name on them`,
      );
      annotate("error", "Tally verification failed", `${vote.id} — unattributed`);
    } else if (verdict.reason === "over-budget") {
      overBudget += 1;
      const who = [
        nameList(dropped, "not-in-roster", roster.names),
        nameList(dropped, "no-crosswalk", roster.names),
      ]
        .filter((s) => s !== "")
        .join("; ");
      console.warn(
        `⚠ ${vote.id} coverage over budget — ${verdict.skippedCount} attributed skips ` +
          `against a budget of ${verdict.budget}: ${who}\n` +
          `  → written; degradation, not a regression (slice 14 recovers these)`,
      );
      annotate("warning", "Coverage over budget", `${vote.id} — ${verdict.skippedCount} skips against a budget of ${verdict.budget}`);
    }
  }

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
  const skippedTotal = writable.reduce((n, v) => n + skips.get(v.id)!.length, 0);
  console.log(`Upserted ${positionRows.length} vote positions (${skippedTotal} for untracked members skipped)`);

  // One query per run, reading back what the chunked upsert actually landed.
  // This is what catches a chunk that silently wrote nothing.
  let reconciliationFailures = 0;
  let surplusRollCalls = 0;
  let surplusRows = 0;
  if (writable.length > 0) {
    const touched = writable.map((v) => v.id);
    const stored = new Map<string, number>();
    // sql.param is load-bearing: without it the array spreads into
    // ANY($1, $2, …) instead of binding as a single text[] parameter.
    const result = await db.execute(sql`
      SELECT roll_call_id, count(*)::int AS stored
      FROM vote_positions WHERE roll_call_id = ANY(${sql.param(touched)}::text[])
      GROUP BY roll_call_id
    `);
    for (const row of result.rows as Array<{ roll_call_id: string; stored: number }>) {
      stored.set(row.roll_call_id, Number(row.stored));
    }
    for (const id of touched) {
      const verdict = verifyReconciliation({
        intended: intended.get(id)!,
        stored: stored.get(id) ?? 0,
      });
      if (verdict.kind === "shortfall") {
        reconciliationFailures += 1;
        console.error(
          `✗ ${id} reconciliation — intended ${verdict.intended} rows, database holds ${verdict.stored}\n` +
            `  → the write did not land as counted`,
        );
        annotate("error", "Tally verification failed", `${id} — reconciliation`);
      } else if (verdict.kind === "surplus") {
        surplusRollCalls += 1;
        surplusRows += verdict.surplus;
      }
    }
    // Surplus is reported once, not per roll call: it is the same handful of
    // departed members repeating across hundreds of roll calls, and ~830 lines
    // would bury the failures this block exists to surface.
    if (surplusRows > 0) {
      annotate(
        "warning",
        "Surplus rows in reconciliation",
        `${num(surplusRows)} rows across ${num(surplusRollCalls)} roll calls this run did not intend to write — pre-slice-14 history`,
      );
    }
  }

  // --- Summary: printed on success as well as failure ---

  const kinds = { verified: 0, "total-only": 0, "no-tally": 0 };
  const noTallyIds: string[] = [];
  for (const [id, verdict] of tallyVerdicts) {
    if (!verdict.ok) continue;
    kinds[verdict.kind] += 1;
    if (verdict.kind === "no-tally") noTallyIds.push(id);
  }

  // A tally that disappears from the source parses as absence, and absence is
  // an ok verdict — so the check disables itself for that roll call rather
  // than failing, and the positions are written with nothing having checked
  // them. Measured over the whole corpus on 2026-09-24, no roll call in
  // either chamber reads as no-tally: the one roll call with no yea/nay
  // tally, the Speaker election house-119-1-2, publishes a candidate tally
  // and verifies as total-only. The steady state is therefore 0, so any
  // occurrence at all is a signal rather than noise worth keying off.
  if (noTallyIds.length > 0) {
    console.warn(
      `⚠ ${noTallyIds.length} roll call(s) published no tally, so nothing verified ` +
        `their positions: ${truncatedList(noTallyIds)}\n` +
        `  → written unverified; a chamber reshaping its tally element reads as ` +
        `absence, not as a failure`,
    );
    annotate(
      "warning",
      "Roll calls published no tally",
      `${noTallyIds.length} roll call(s) written unverified: ${truncatedList(noTallyIds)}`,
    );
  }

  const published = writable.reduce((n, v) => {
    if (v.tally.kind === "buckets") {
      return n + v.tally.yea + v.tally.nay + v.tally.present + v.tally.notVoting;
    }
    return v.tally.kind === "total" ? n + v.tally.total : n;
  }, 0);
  const allSkips = writable.flatMap((v) => skips.get(v.id)!);
  const byReason: Record<SkipReason, number> = {
    "not-in-roster": 0,
    "no-crosswalk": 0,
  };
  for (const s of allSkips) byReason[s.reason] += 1;

  const lines = [
    `Tally verification — ${votes.length} roll calls`,
    `  verified          ${String(kinds.verified).padStart(5)}   published tally matched parsed positions, bucket for bucket`,
    `  total-only        ${String(kinds["total-only"]).padStart(5)}   candidate tally; member count checked`,
    noTallyIds.length > 0
      ? `  no tally          ${String(kinds["no-tally"]).padStart(5)}   ⚠ chamber published none — nothing verified these positions: ${truncatedList(noTallyIds)}`
      : `  no tally          ${String(kinds["no-tally"]).padStart(5)}   chamber published none`,
    `  quarantined       ${String(quarantined.size).padStart(5)}`,
    `  not fetched       ${String(fetchFailures).padStart(5)}   ${
      fetchFailures > 0
        ? "⚠ documents requested but never arrived — re-run later to fill the gap"
        : "every requested document arrived"
    }`,
    ...(senate.menuUnavailable
      ? ["  ⚠ the Senate vote menu was unavailable — this run covers the House only"]
      : []),
    `  positions published ${num(published).padStart(9)}`,
    `  positions stored    ${num(positionRows.length).padStart(9)}`,
    `  positions skipped   ${num(allSkips.length).padStart(9)}   ${unattributed === 0 ? "(all attributed)" : "(see ✗ blocks above)"}`,
  ];
  for (const reason of ["not-in-roster", "no-crosswalk"] as const) {
    if (byReason[reason] === 0) continue;
    lines.push(
      `    ${String(byReason[reason]).padStart(5)} ${reason.padEnd(14)} ${nameList(allSkips, reason, roster.names)}`,
    );
  }
  lines.push(`  unattributed        ${num(unattributed).padStart(9)}`);
  lines.push(
    `  over budget         ${num(overBudget).padStart(9)}   roll calls past the per-chamber skip budget (warning only)`,
  );
  lines.push(
    `  surplus rows        ${num(surplusRows).padStart(9)}   on ${num(surplusRollCalls)} roll calls: stored history this run did not intend to write ` +
      `(expected to reach 0 when slice 14 lands)`,
  );
  console.log(lines.join("\n"));

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (GITHUB_ACTIONS && stepSummary) {
    const rows: Array<[string, string]> = [
      ["roll calls", num(votes.length)],
      ["verified", num(kinds.verified)],
      ["total-only", num(kinds["total-only"])],
      ["no tally", num(kinds["no-tally"])],
      ["quarantined", num(quarantined.size)],
      ["documents not fetched", num(fetchFailures)],
      ["senate vote menu", senate.menuUnavailable ? "unavailable" : "ok"],
      ["positions published", num(published)],
      ["positions stored", num(positionRows.length)],
      ["positions skipped", num(allSkips.length)],
      ["  not-in-roster", num(byReason["not-in-roster"])],
      ["  no-crosswalk", num(byReason["no-crosswalk"])],
      ["unattributed", num(unattributed)],
      ["over budget", num(overBudget)],
      ["surplus rows", num(surplusRows)],
      ["  roll calls with surplus", num(surplusRollCalls)],
    ];
    appendFileSync(
      stepSummary,
      [
        "### Tally verification",
        "",
        "| | |",
        "|---|---:|",
        ...rows.map(([label, value]) => `| ${label} | ${value} |`),
        "",
      ].join("\n"),
    );
  }

  const counts = await db.execute(sql`
    SELECT chamber, count(*)::int AS roll_calls, min(vote_date) AS oldest, max(vote_date) AS newest
    FROM roll_calls GROUP BY chamber ORDER BY chamber
  `);
  console.log("roll_calls by chamber:", counts.rows);

  // Exit 2 — not 1 — so a reader of a red cron can tell "the sync ran and the
  // data is wrong" from "the sync crashed" without opening the log. Being
  // over the coverage budget is loud but not fatal: a member leaving office
  // is a normal event, and a nightly that cries wolf gets ignored.
  return quarantined.size > 0 || unattributed > 0 || reconciliationFailures > 0
    ? 2
    : 0;
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
