import { sql } from "drizzle-orm";
import Link from "next/link";
import { SearchBar } from "@/components/search-bar";
import { type LegCardItem } from "@/components/leg-card";
import { RecentVotesCarousel } from "@/components/recent-votes-carousel";
import { db } from "@/db";
import {
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

export default async function HomePage() {
  const [stats, recentVotes] = await Promise.all([
    getStats(),
    getRecentVotes(),
  ]);
  const inOffice = stats.senators + stats.representatives;

  return (
    <>
      {/* Hero */}
      <section className="bg-flag-blue bg-gradient-to-b from-flag-blue to-flag-blue-deep px-4 py-16 text-center text-white sm:py-20">
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
      </section>

      {/* Stats band */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4 sm:px-6">
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
          <div>
            <p className="text-3xl font-bold">
              <span className="text-flag-blue">{stats.democrats}D</span>
              <span className="text-gray-300"> / </span>
              <span className="text-flag-red">{stats.republicans}R</span>
              {stats.independents > 0 && (
                <span className="text-gray-500"> / {stats.independents}I</span>
              )}
            </p>
            <p className="text-sm text-gray-500">Party split</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
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
        <section className="mt-12 grid gap-4 lg:grid-cols-3">
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
            href="/members"
            className="rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
          >
            <h3 className="font-bold text-flag-blue">Browse all members →</h3>
            <p className="mt-2 text-sm text-gray-600">
              Every senator and representative, by state — with their voting
              record.
            </p>
          </Link>
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
