import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { BackLink } from "@/components/back-link";
import { MemberAvatar } from "@/components/member-avatar";
import { legislators } from "@/db/schema";
import {
  formatDate,
  partyBadgeClass,
  positionBadgeClass,
  positionLabel,
  seatLabel,
  STATE_NAMES,
} from "@/lib/format";

// Cache rendered pages with ISR; data changes at most daily (nightly sync).
// Empty generateStaticParams opts the route into on-demand ISR (nothing is
// prerendered at build; pages render + cache on first request).
export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

async function getMember(id: string) {
  const rows = await db
    .select()
    .from(legislators)
    .where(eq(legislators.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function getVoteStats(id: string) {
  const rows = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE position = 'yea')::int AS yea,
      count(*) FILTER (WHERE position = 'nay')::int AS nay,
      count(*) FILTER (WHERE position = 'not_voting')::int AS missed
    FROM vote_positions WHERE legislator_id = ${id}
  `);
  return rows.rows[0] as {
    total: number;
    yea: number;
    nay: number;
    missed: number;
  };
}

// How often the member votes with their own party's majority (loyalty).
// Only meaningful for D/R; returns null for independents / no data.
async function getPartyLoyalty(
  id: string,
  party: string,
): Promise<number | null> {
  if (party !== "Democrat" && party !== "Republican") return null;
  const rows = await db.execute(sql`
    WITH maj AS (
      SELECT vp.roll_call_id,
        CASE WHEN count(*) FILTER (WHERE vp.position = 'yea')
                  >= count(*) FILTER (WHERE vp.position = 'nay')
             THEN 'yea' ELSE 'nay' END AS pos
      FROM vote_positions vp
      JOIN legislators l ON l.id = vp.legislator_id
      WHERE vp.position IN ('yea', 'nay') AND l.party = ${party}
      GROUP BY vp.roll_call_id
    )
    SELECT
      count(*) FILTER (WHERE vp.position::text = maj.pos)::int AS with_party,
      count(*)::int AS decisive
    FROM vote_positions vp
    JOIN maj ON maj.roll_call_id = vp.roll_call_id
    WHERE vp.legislator_id = ${id} AND vp.position IN ('yea', 'nay')
  `);
  const r = rows.rows[0] as { with_party: number; decisive: number };
  if (!r || r.decisive === 0) return null;
  return Math.round((r.with_party / r.decisive) * 100);
}

async function getRecentPositions(id: string) {
  const rows = await db.execute(sql`
    SELECT rc.id, rc.chamber, rc.vote_date, rc.question, rc.result,
           b.title, vp.position
    FROM vote_positions vp
    JOIN roll_calls rc ON rc.id = vp.roll_call_id
    LEFT JOIN bills b ON b.id = rc.bill_id
    WHERE vp.legislator_id = ${id}
    ORDER BY rc.vote_date DESC, rc.roll_number DESC
    LIMIT 12
  `);
  return rows.rows as Array<{
    id: string;
    chamber: string;
    vote_date: string;
    question: string;
    result: string;
    title: string | null;
    position: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) return { title: "Member not found" };
  return {
    title: member.fullName,
    description: `How ${member.fullName} (${member.party}, ${member.state}) voted on recent bills in the U.S. ${member.chamber === "senate" ? "Senate" : "House"}.`,
  };
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className={`mt-0.5 text-lg font-bold ${accent ?? "text-gray-900"}`}>
        {value}
      </dd>
    </div>
  );
}

export default async function MemberPage({ params }: Props) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) notFound();

  const [stats, positions, partyLoyalty] = await Promise.all([
    getVoteStats(id),
    getRecentPositions(id),
    getPartyLoyalty(id, member.party),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4">
        <BackLink fallback="/members" />
      </div>
      <section className="rounded-2xl border border-gray-200 bg-flag-blue-soft/40 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row">
          <MemberAvatar
            src={member.photoUrl}
            name={member.fullName}
            width={120}
            height={146}
            priority
            className="h-[146px] w-[120px] shrink-0 rounded-xl border border-gray-200 bg-gray-100 object-cover text-3xl"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                {member.fullName}
              </h1>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${partyBadgeClass(member.party)}`}
              >
                {member.party}
              </span>
              {!member.inOffice && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
                  No longer in office
                </span>
              )}
            </div>
            <p className="mt-1 text-gray-600">
              {seatLabel(member)} — {STATE_NAMES[member.state] ?? member.state}
            </p>

            <dl
              className={`mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-200/70 pt-4 ${
                partyLoyalty != null ? "sm:grid-cols-5" : "sm:grid-cols-4"
              }`}
            >
              {member.memberSince && (
                <Stat
                  label="In office since"
                  value={member.memberSince.slice(0, 4)}
                />
              )}
              {member.billsSponsored != null && (
                <Stat label="Bills sponsored" value={member.billsSponsored} />
              )}
              {member.billsCosponsored != null && (
                <Stat label="Bills cosponsored" value={member.billsCosponsored} />
              )}
              <Stat label="Recorded votes" value={stats.total} />
              {partyLoyalty != null && (
                <Stat label="Votes with party" value={`${partyLoyalty}%`} />
              )}
            </dl>
            <p className="mt-3 text-xs text-gray-500">
              On recorded votes:{" "}
              <span className="font-semibold text-green-700">{stats.yea} yea</span>
              {" · "}
              <span className="font-semibold text-flag-red">{stats.nay} nay</span>
              {stats.missed > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-gray-600">
                    {stats.missed} missed
                  </span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Vote totals reflect roll calls tracked since January 2026.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900">Recent votes</h2>
        {positions.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
            No recorded votes yet — vote history goes back further as more
            roll calls are ingested.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {positions.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/votes/${p.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-flag-blue-soft/50"
                >
                  <span
                    className={`w-24 shrink-0 rounded-full px-2.5 py-1 text-center text-xs font-bold ${positionBadgeClass(p.position)}`}
                  >
                    {positionLabel(p.position)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">
                      {p.title ?? p.question}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {p.title ? `${p.question} · ` : ""}
                      {p.result} · {formatDate(p.vote_date)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
