import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { parseBillQuery } from "@/lib/bill-search";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bills",
  description:
    "Search bills before the U.S. Congress by number or title, and see how members voted.",
};

type Props = { searchParams: Promise<{ q?: string }> };

type BillRow = {
  id: string;
  billType: string;
  number: number;
  title: string;
  status: string | null;
  latestActionDate: string | null;
  rollCallCount: number;
};

async function searchBills(q: string): Promise<BillRow[]> {
  const parsed = parseBillQuery(q);
  const cond = parsed
    ? parsed.billType
      ? sql`b.bill_type = ${parsed.billType} AND b.number = ${parsed.number}`
      : sql`b.number = ${parsed.number}`
    : q.trim()
      ? sql`b.title ILIKE ${`%${q.trim()}%`}`
      : sql`TRUE`;

  const rows = await db.execute(sql`
    SELECT b.id, b.bill_type AS "billType", b.number, b.title, b.status,
           b.latest_action_date AS "latestActionDate",
           count(rc.id)::int AS "rollCallCount"
    FROM bills b
    LEFT JOIN roll_calls rc ON rc.bill_id = b.id
    WHERE ${cond}
    GROUP BY b.id
    ORDER BY b.latest_action_date DESC NULLS LAST
    LIMIT 100
  `);
  return rows.rows as BillRow[];
}

export default async function BillsPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const results = await searchBills(q);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-gray-900">Bills</h1>
      <p className="mt-2 text-gray-600">
        Search by number (e.g. <span className="font-mono">HR 1234</span>) or by
        words in the title. Only bills with recorded votes appear here for now.
      </p>

      <form action="/bills" method="get" className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="HR 1234, or “labor”…"
          aria-label="Search bills"
          className="w-full rounded-full border-2 border-gray-200 px-5 py-3 text-gray-900 outline-none focus:border-flag-red"
        />
        <button
          type="submit"
          className="rounded-full bg-flag-blue px-6 py-3 font-semibold text-white hover:bg-flag-blue-deep"
        >
          Search
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-500">
        {q ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”` : `${results.length} bills with recorded votes`}
      </p>

      <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {results.map((bill) => (
          <li key={bill.id}>
            <Link
              href={`/bills/${bill.id}`}
              className="block px-5 py-4 hover:bg-flag-blue-soft/50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-xs font-semibold uppercase text-flag-blue">
                  {bill.billType} {bill.number}
                </span>
                {bill.latestActionDate && (
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatDate(bill.latestActionDate)}
                  </span>
                )}
              </div>
              <p className="mt-1 font-medium text-gray-900">{bill.title}</p>
              <p className="mt-1 text-xs text-gray-500">
                {bill.rollCallCount} recorded vote
                {bill.rollCallCount === 1 ? "" : "s"}
                {bill.status ? ` · ${bill.status}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {results.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          No bills match. Try a bill number like “HR 1” or a word from the
          title.
        </p>
      )}
    </div>
  );
}
