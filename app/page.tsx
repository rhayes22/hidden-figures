import { sql } from "drizzle-orm";
import Link from "next/link";
import { MemberAvatar } from "@/components/member-avatar";
import { SearchBar } from "@/components/search-bar";
import { type LegCardItem } from "@/components/leg-card";
import { RecentVotesCarousel } from "@/components/recent-votes-carousel";
import { partyAbbrev } from "@/lib/format";
import {
  ChamberBreakdown,
  type Parties,
  type Performance,
} from "@/components/chamber-breakdown";
import { db } from "@/db";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  categoryForBillType,
  categoryForQuestion,
  votePhase,
} from "@/lib/legislation";

export const dynamic = "force-dynamic";

type RecentVote = {
  id: string;
  chamber: string;
  vote_date: string;
  question: string;
  result: string;
  title: string | null;
  bill_type: string | null;
  bill_number: number | null;
  yea: number;
  nay: number;
};

function toCardItem(v: RecentVote): LegCardItem {
  const phase = votePhase(v.result);
  const category = v.bill_type
    ? categoryForBillType(v.bill_type)
    : categoryForQuestion(v.question);
  const label = v.bill_type
    ? `${v.bill_type.toUpperCase()} ${v.bill_number}`
    : v.question.replace(/^On the |^On /i, "");
  return {
    href: `/votes/${v.id}`,
    label,
    category: CATEGORY_LABEL[category],
    chamber: v.chamber as "house" | "senate",
    phaseLabel: phase.label,
    phaseKind: phase.kind,
    title: v.title ?? v.question,
    date: v.vote_date,
    yea: v.yea,
    nay: v.nay,
  };
}

async function getStats() {
  const rows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE chamber = 'senate')::int AS senators,
      count(*) FILTER (WHERE chamber = 'house')::int AS representatives,
      count(*) FILTER (WHERE party = 'Democrat')::int AS democrats,
      count(*) FILTER (WHERE party = 'Republican')::int AS republicans,
      count(*) FILTER (WHERE party NOT IN ('Democrat', 'Republican'))::int AS independents
    FROM legislators WHERE in_office
  `);
  return rows.rows[0] as {
    senators: number;
    representatives: number;
    democrats: number;
    republicans: number;
    independents: number;
  };
}

async function getRecentVotes(): Promise<RecentVote[]> {
  const rows = await db.execute(sql`
    SELECT rc.id, rc.chamber, rc.vote_date, rc.question, rc.result, b.title,
      b.bill_type, b.number AS bill_number,
      count(*) FILTER (WHERE vp.position = 'yea')::int AS yea,
      count(*) FILTER (WHERE vp.position = 'nay')::int AS nay
    FROM roll_calls rc
    LEFT JOIN bills b ON b.id = rc.bill_id
    LEFT JOIN vote_positions vp ON vp.roll_call_id = rc.id
    GROUP BY rc.id, rc.chamber, rc.vote_date, rc.question, rc.result, b.title,
      b.bill_type, b.number
    ORDER BY rc.vote_date DESC, rc.roll_number DESC
    LIMIT 10
  `);
  return rows.rows as RecentVote[];
}

function emptyPerformance(): Performance {
  return Object.fromEntries(
    CATEGORIES.map((c) => [c, { votedOn: 0, passed: 0, failed: 0 }]),
  ) as Performance;
}

// Per-chamber, per-category counts of roll calls voted on / passed / failed.
async function getPerformance(): Promise<{
  house: Performance;
  senate: Performance;
}> {
  const res = await db.execute(sql`
    SELECT rc.chamber, rc.result, rc.question, b.bill_type
    FROM roll_calls rc
    LEFT JOIN bills b ON b.id = rc.bill_id
  `);
  const rows = res.rows as Array<{
    chamber: string;
    result: string;
    question: string;
    bill_type: string | null;
  }>;
  const out = { house: emptyPerformance(), senate: emptyPerformance() };
  for (const r of rows) {
    if (r.chamber !== "house" && r.chamber !== "senate") continue;
    const category = r.bill_type
      ? categoryForBillType(r.bill_type)
      : categoryForQuestion(r.question);
    const cell = out[r.chamber][category];
    cell.votedOn += 1;
    const kind = votePhase(r.result).kind;
    if (kind === "passed") cell.passed += 1;
    else if (kind === "failed") cell.failed += 1;
  }
  return out;
}

// In-office party split (D/R/I) per chamber.
async function getChamberStats(): Promise<{ house: Parties; senate: Parties }> {
  const res = await db.execute(sql`
    SELECT chamber,
      count(*) FILTER (WHERE party = 'Democrat')::int AS d,
      count(*) FILTER (WHERE party = 'Republican')::int AS r,
      count(*) FILTER (WHERE party NOT IN ('Democrat', 'Republican'))::int AS i,
      count(*)::int AS total
    FROM legislators WHERE in_office GROUP BY chamber
  `);
  const rows = res.rows as Array<{
    chamber: string;
    d: number;
    r: number;
    i: number;
    total: number;
  }>;
  const pick = (c: string): Parties => {
    const row = rows.find((x) => x.chamber === c);
    return { d: row?.d ?? 0, r: row?.r ?? 0, i: row?.i ?? 0, total: row?.total ?? 0 };
  };
  return { house: pick("house"), senate: pick("senate") };
}

type DeanRow = {
  id: string;
  full_name: string;
  party: string;
  state: string;
  district: string | null;
  chamber: string;
  photo_url: string | null;
  member_since: string;
};

// The "deans" of Congress — longest continuous-or-not tenure by first term.
async function getLongestServing(): Promise<DeanRow[]> {
  const res = await db.execute(sql`
    SELECT id, full_name, party, state, district, chamber, photo_url, member_since
    FROM legislators
    WHERE in_office AND member_since IS NOT NULL
    ORDER BY member_since ASC
    LIMIT 5
  `);
  return res.rows as DeanRow[];
}

export default async function HomePage() {
  const [stats, recentVotes, performance, chamberStats, deans] =
    await Promise.all([
      getStats(),
      getRecentVotes(),
      getPerformance(),
      getChamberStats(),
      getLongestServing(),
    ]);
  const inOffice = stats.senators + stats.representatives;

  return (
    <>
      {/* Hero — fills the screen on load */}
      <section className="relative flex min-h-screen flex-col items-center justify-center bg-flag-blue bg-gradient-to-b from-flag-blue to-flag-blue-deep px-4 py-16 text-center text-white">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          How did your representatives{" "}
          <span className="text-red-300">actually</span> vote?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-blue-200">
          Every roll call from the U.S. House and Senate — by member, by bill,
          straight from the official record.
        </p>
        <div className="mt-8">
          <SearchBar />
        </div>
        <p className="mt-4 text-sm text-blue-300">
          Try a name like &ldquo;Jordan&rdquo;, or a state like &ldquo;OH&rdquo;
        </p>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-xs font-medium uppercase tracking-widest text-blue-200">
          ↓ Explore
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-12 sm:px-6">
        {/* Meet the 119th Congress */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900">
            Meet the 119th Congress
          </h2>
          <div className="mt-6 grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-flag-blue">{inOffice}</p>
              <p className="text-sm text-gray-500">Members in office</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-flag-blue">
                {stats.senators}
              </p>
              <p className="text-sm text-gray-500">Senators</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-flag-blue">
                {stats.representatives}
              </p>
              <p className="text-sm text-gray-500">Representatives</p>
            </div>
          </div>

          {/* Meet the members — by party */}
          <div className="mt-8">
            <h3 className="text-lg font-bold text-gray-900">Meet the members</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Link
                href="/members/party/republican"
                className="flex items-center justify-between gap-3 rounded-xl bg-flag-red px-6 py-6 text-white shadow-sm ring-1 ring-black/10 transition hover:brightness-110"
              >
                <span className="text-xl font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:text-2xl">
                  Republicans
                </span>
                <span className="text-4xl font-extrabold tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                  {stats.republicans}
                </span>
              </Link>
              <Link
                href="/members/party/democrat"
                className="flex items-center justify-between gap-3 rounded-xl bg-flag-blue px-6 py-6 text-white shadow-sm ring-1 ring-black/10 transition hover:brightness-110"
              >
                <span className="text-xl font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:text-2xl">
                  Democrats
                </span>
                <span className="text-4xl font-extrabold tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                  {stats.democrats}
                </span>
              </Link>
              <Link
                href="/members/party/independent"
                className="flex items-center justify-between gap-3 rounded-xl bg-gray-600 px-6 py-6 text-white shadow-sm ring-1 ring-black/10 transition hover:brightness-110"
              >
                <span className="text-xl font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:text-2xl">
                  Independents
                </span>
                <span className="text-4xl font-extrabold tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                  {stats.independents}
                </span>
              </Link>
            </div>
          </div>
        </section>

        {/* Longest-serving members */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900">
            Longest-serving members
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            The deans of Congress, by the year they were first sworn in.
          </p>
          <ol className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {deans.map((m, i) => (
              <li key={m.id}>
                <Link
                  href={`/members/${m.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-flag-blue-soft/50"
                >
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-gray-400">
                    {i + 1}
                  </span>
                  <MemberAvatar
                    src={m.photo_url}
                    name={m.full_name}
                    width={36}
                    height={44}
                    className="h-11 w-9 shrink-0 rounded bg-gray-100 object-cover text-xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gray-900">
                      {m.full_name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {partyAbbrev(m.party)} ·{" "}
                      {m.chamber === "senate" ? "Senator" : "Representative"} ·{" "}
                      {m.state}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-flag-blue">
                    Since {m.member_since.slice(0, 4)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* Voting record by chamber */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900">
            How they&rsquo;ve voted
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Roll-call votes this Congress, by type and outcome.
          </p>
          <ChamberBreakdown
            house={{
              parties: chamberStats.house,
              performance: performance.house,
            }}
            senate={{
              parties: chamberStats.senate,
              performance: performance.senate,
            }}
          />
        </section>

        {/* Recent votes */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Recent votes</h2>
            <span className="text-sm text-gray-500">
              From the official House and Senate records
            </span>
          </div>
          <div className="mt-6">
            <RecentVotesCarousel items={recentVotes.map(toCardItem)} />
          </div>
        </section>

        {/* Upcoming votes + quick links */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-dashed border-gray-300 bg-flag-blue-soft/50 p-6">
            <h3 className="font-bold text-gray-900">Upcoming votes</h3>
            <p className="mt-2 text-sm text-gray-600">
              Floor-schedule integration is coming. Until then, see the
              official schedules:
            </p>
            <ul className="mt-3 space-y-1 text-sm font-medium text-flag-blue">
              <li>
                <a
                  href="https://docs.house.gov"
                  className="hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  House floor schedule ↗
                </a>
              </li>
              <li>
                <a
                  href="https://www.senate.gov/legislative/schedule/floor_schedule.htm"
                  className="hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Senate floor schedule ↗
                </a>
              </li>
            </ul>
          </div>
          <Link
            href="/bills"
            className="rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
          >
            <h3 className="font-bold text-flag-blue">Browse bills →</h3>
            <p className="mt-2 text-sm text-gray-600">
              Search by number or title and see the full yea/nay roster for
              each vote.
            </p>
          </Link>
        </section>
      </div>
    </>
  );
}
