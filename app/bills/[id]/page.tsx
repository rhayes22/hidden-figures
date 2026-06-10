import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function getBill(id: string) {
  const rows = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getBillRollCalls(id: string) {
  const rows = await db.execute(sql`
    SELECT rc.id, rc.chamber, rc.vote_date, rc.question, rc.result,
      count(*) FILTER (WHERE vp.position = 'yea')::int AS yea,
      count(*) FILTER (WHERE vp.position = 'nay')::int AS nay
    FROM roll_calls rc
    LEFT JOIN vote_positions vp ON vp.roll_call_id = rc.id
    WHERE rc.bill_id = ${id}
    GROUP BY rc.id, rc.chamber, rc.vote_date, rc.question, rc.result
    ORDER BY rc.vote_date DESC, rc.roll_number DESC
  `);
  return rows.rows as Array<{
    id: string;
    chamber: string;
    vote_date: string;
    question: string;
    result: string;
    yea: number;
    nay: number;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bill = await getBill(id);
  if (!bill) return { title: "Bill not found" };
  return {
    title: `${bill.billType.toUpperCase()} ${bill.number} — ${bill.title}`,
    description: bill.title,
  };
}

export default async function BillPage({ params }: Props) {
  const { id } = await params;
  const bill = await getBill(id);
  if (!bill) notFound();
  const votes = await getBillRollCalls(id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="font-mono text-sm font-semibold uppercase text-flag-blue">
        {bill.billType} {bill.number} · {bill.congress}th Congress
      </p>
      <h1 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
        {bill.title}
      </h1>
      {bill.status && (
        <p className="mt-2 text-sm text-gray-600">
          {bill.status}
          {bill.latestActionDate
            ? ` (${formatDate(bill.latestActionDate)})`
            : ""}
        </p>
      )}
      {bill.summary && (
        <p className="mt-4 max-w-prose text-gray-700">{bill.summary}</p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900">
          Roll-call votes on this bill
        </h2>
        {votes.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No recorded roll-call votes yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {votes.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/votes/${v.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-flag-blue-soft/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">
                      {v.question}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {v.chamber === "senate" ? "Senate" : "House"} ·{" "}
                      {v.result} · {formatDate(v.vote_date)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-gray-600">
                    {v.yea}–{v.nay}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-sm">
        <Link href="/bills" className="text-flag-blue hover:underline">
          ← All bills
        </Link>
      </p>
    </div>
  );
}
