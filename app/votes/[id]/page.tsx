import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { BackLink } from "@/components/back-link";
import { VoteRoster, type RosterMember } from "@/components/vote-roster";
import { VoteStatusBadge } from "@/components/vote-status";
import { formatDate, partyAbbrev, partyBreakdown } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function getRollCall(id: string) {
  const rows = await db.execute(sql`
    SELECT rc.id, rc.chamber, rc.vote_date, rc.question, rc.result,
           rc.bill_id, b.title AS bill_title
    FROM roll_calls rc
    LEFT JOIN bills b ON b.id = rc.bill_id
    WHERE rc.id = ${id}
    LIMIT 1
  `);
  return (rows.rows[0] ?? null) as {
    id: string;
    chamber: string;
    vote_date: string;
    question: string;
    result: string;
    bill_id: string | null;
    bill_title: string | null;
  } | null;
}

async function getRoster(id: string): Promise<RosterMember[]> {
  const rows = await db.execute(sql`
    SELECT l.id, l.full_name AS "fullName", l.party, l.state, vp.position
    FROM vote_positions vp
    JOIN legislators l ON l.id = vp.legislator_id
    WHERE vp.roll_call_id = ${id}
  `);
  return rows.rows as RosterMember[];
}

async function getOtherVotesOnBill(billId: string, currentId: string) {
  const rows = await db.execute(sql`
    SELECT rc.id, rc.chamber, rc.vote_date, rc.question, rc.result
    FROM roll_calls rc
    WHERE rc.bill_id = ${billId} AND rc.id <> ${currentId}
    ORDER BY rc.vote_date DESC, rc.roll_number DESC
  `);
  return rows.rows as Array<{
    id: string;
    chamber: string;
    vote_date: string;
    question: string;
    result: string;
  }>;
}

function Tile({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 text-center ${className}`}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {label}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const rc = await getRollCall(id);
  if (!rc) return { title: "Vote not found" };
  const subject = rc.bill_title ?? rc.question;
  return {
    title: `${subject} — ${rc.result}`,
    description: `Full roll-call vote: how every member of the U.S. ${rc.chamber === "senate" ? "Senate" : "House"} voted on ${subject} (${formatDate(rc.vote_date)}).`,
  };
}

export default async function VotePage({ params }: Props) {
  const { id } = await params;
  const rc = await getRollCall(id);
  if (!rc) notFound();

  const [roster, others] = await Promise.all([
    getRoster(id),
    rc.bill_id ? getOtherVotesOnBill(rc.bill_id, id) : Promise.resolve([]),
  ]);
  const breakdown = partyBreakdown(roster);
  const total = { yea: 0, nay: 0, present: 0, not_voting: 0 };
  for (const m of roster) total[m.position as keyof typeof total] += 1;
  const decisive = total.yea + total.nay;
  const billNumber = rc.bill_id
    ? (() => {
        const [type, num] = rc.bill_id.split("-");
        return `${type.toUpperCase()} ${num}`;
      })()
    : null;
  const fullTitle = rc.bill_title ?? rc.question;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <BackLink fallback="/bills" />

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-flag-blue-soft px-2.5 py-0.5 font-semibold uppercase tracking-wide text-flag-blue">
          {rc.chamber === "senate" ? "Senate" : "House"}
        </span>
        {billNumber && (
          <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold uppercase text-gray-700">
            {billNumber}
          </span>
        )}
        <span className="text-gray-400">{formatDate(rc.vote_date)}</span>
      </div>

      <h1
        className="mt-3 line-clamp-2 text-2xl font-bold text-gray-900 sm:text-3xl"
        title={fullTitle}
      >
        {fullTitle}
      </h1>
      {rc.bill_title && (
        <p className="mt-1 text-gray-600">{rc.question}</p>
      )}

      {/* Scoreboard + party breakdown */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <VoteStatusBadge result={rc.result} />
          {decisive > 0 && (
            <span className="text-sm font-medium text-gray-500">
              {total.yea}&ndash;{total.nay}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Yea"
            value={total.yea}
            className="bg-green-50 text-green-700"
          />
          <Tile
            label="Nay"
            value={total.nay}
            className="bg-flag-red-soft text-flag-red"
          />
          <Tile
            label="Present"
            value={total.present}
            className="bg-gray-50 text-gray-600"
          />
          <Tile
            label="Not voting"
            value={total.not_voting}
            className="bg-gray-50 text-gray-500"
          />
        </div>
        {decisive > 0 && (
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="bg-flag-blue"
              style={{ width: `${(total.yea / decisive) * 100}%` }}
            />
            <div
              className="bg-flag-red"
              style={{ width: `${(total.nay / decisive) * 100}%` }}
            />
          </div>
        )}
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="pb-1 font-semibold">Party</th>
              <th className="pb-1 pl-3 text-right font-semibold">Yea</th>
              <th className="pb-1 pl-3 text-right font-semibold">Nay</th>
              <th className="pb-1 pl-3 text-right font-semibold">Present</th>
              <th className="pb-1 pl-3 text-right font-semibold">
                Not&nbsp;voting
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.party} className="border-t border-gray-100">
                <td className="py-1.5 font-medium text-gray-800">
                  {partyAbbrev(row.party)} · {row.party}
                </td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {row.yea}
                </td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {row.nay}
                </td>
                <td className="py-1.5 pl-3 text-right tabular-nums text-gray-500">
                  {row.present}
                </td>
                <td className="py-1.5 pl-3 text-right tabular-nums text-gray-500">
                  {row.not_voting}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Other roll calls on the same bill */}
      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-gray-900">
            Other votes on this bill
          </h2>
          <ul className="mt-3 space-y-2">
            {others.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/votes/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:bg-flag-blue-soft/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">
                      {o.question}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {o.chamber === "senate" ? "Senate" : "House"} ·{" "}
                      {formatDate(o.vote_date)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-gray-600">
                    {o.result}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Full roster */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900">
          How everyone voted
        </h2>
        {roster.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No individual positions recorded for this vote.
          </p>
        ) : (
          <div className="mt-4">
            <VoteRoster members={roster} />
          </div>
        )}
      </section>

    </div>
  );
}
