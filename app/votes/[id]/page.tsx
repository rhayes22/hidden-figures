import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { VoteRoster, type RosterMember } from "@/components/vote-roster";
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

  const roster = await getRoster(id);
  const breakdown = partyBreakdown(roster);
  const total = { yea: 0, nay: 0, present: 0, not_voting: 0 };
  for (const m of roster) total[m.position as keyof typeof total] += 1;
  const passed = /pass|agreed|confirm/i.test(rc.result);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-flag-blue-soft px-2.5 py-0.5 font-semibold uppercase tracking-wide text-flag-blue">
          {rc.chamber === "senate" ? "Senate" : "House"}
        </span>
        <span className="text-gray-400">{formatDate(rc.vote_date)}</span>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-gray-900 sm:text-3xl">
        {rc.bill_title ?? rc.question}
      </h1>
      <p className="mt-1 text-gray-600">
        {rc.question}
        {" · "}
        <span className={passed ? "text-green-700" : "text-flag-red"}>
          {rc.result}
        </span>
      </p>
      {rc.bill_id && (
        <p className="mt-1 text-sm text-gray-500">Bill {rc.bill_id.toUpperCase()}</p>
      )}

      {/* Tally + party breakdown */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-medium">
          <span className="text-green-800">{total.yea} Yea</span>
          <span className="text-flag-red">{total.nay} Nay</span>
          {total.present > 0 && (
            <span className="text-gray-600">{total.present} Present</span>
          )}
          {total.not_voting > 0 && (
            <span className="text-gray-500">{total.not_voting} Not Voting</span>
          )}
        </div>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="pb-1 font-semibold">Party</th>
              <th className="pb-1 text-right font-semibold">Yea</th>
              <th className="pb-1 text-right font-semibold">Nay</th>
              <th className="pb-1 text-right font-semibold">Present</th>
              <th className="pb-1 text-right font-semibold">Not Voting</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.party} className="border-t border-gray-100">
                <td className="py-1.5 font-medium text-gray-800">
                  {partyAbbrev(row.party)} · {row.party}
                </td>
                <td className="py-1.5 text-right tabular-nums">{row.yea}</td>
                <td className="py-1.5 text-right tabular-nums">{row.nay}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-500">
                  {row.present}
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-500">
                  {row.not_voting}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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

      <p className="mt-10 text-sm">
        <Link href="/" className="text-flag-blue hover:underline">
          ← Back to recent votes
        </Link>
      </p>
    </div>
  );
}
