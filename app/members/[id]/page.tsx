import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { legislators } from "@/db/schema";
import {
  formatDate,
  partyBadgeClass,
  positionBadgeClass,
  positionLabel,
  seatLabel,
  STATE_NAMES,
} from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function getMember(id: string) {
  const rows = await db
    .select()
    .from(legislators)
    .where(eq(legislators.id, id))
    .limit(1);
  return rows[0] ?? null;
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

export default async function MemberPage({ params }: Props) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) notFound();

  const positions = await getRecentPositions(id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start gap-6 sm:flex-row">
        {member.photoUrl && (
          <Image
            src={member.photoUrl}
            alt={`Official portrait of ${member.fullName}`}
            width={150}
            height={183}
            priority
            className="rounded-xl border border-gray-200 bg-gray-100 object-cover"
          />
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900">
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
          <p className="mt-2 text-lg text-gray-600">
            {seatLabel(member)} — {STATE_NAMES[member.state] ?? member.state}
          </p>
          {member.termEnd && (
            <p className="mt-1 text-sm text-gray-500">
              Current term ends {formatDate(member.termEnd)}
            </p>
          )}
        </div>
      </div>

      <section className="mt-10">
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
