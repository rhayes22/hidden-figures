import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { BillsBrowser, type LegItem } from "@/components/bills-browser";
import {
  billPhase,
  categoryForBillType,
  categoryForQuestion,
  votePhase,
} from "@/lib/legislation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Votes & Legislation",
  description:
    "Browse everything the U.S. Congress voted on — bills, resolutions, nominations, and motions — by chamber and type.",
};

type Row = {
  rc_id: string;
  bill_id: string | null;
  chamber: string;
  vote_date: string;
  question: string;
  result: string;
  bill_type: string | null;
  bill_number: number | null;
  bill_title: string | null;
  bill_status: string | null;
  yea: number;
  nay: number;
};

async function getItems(): Promise<LegItem[]> {
  const res = await db.execute(sql`
    SELECT rc.id AS rc_id, rc.bill_id, rc.chamber, rc.vote_date::text AS vote_date,
           rc.question, rc.result,
           b.bill_type, b.number AS bill_number, b.title AS bill_title,
           b.status AS bill_status,
           count(vp.*) FILTER (WHERE vp.position = 'yea')::int AS yea,
           count(vp.*) FILTER (WHERE vp.position = 'nay')::int AS nay
    FROM roll_calls rc
    LEFT JOIN bills b ON b.id = rc.bill_id
    LEFT JOIN vote_positions vp ON vp.roll_call_id = rc.id
    GROUP BY rc.id, b.id
    ORDER BY rc.vote_date DESC, rc.roll_number DESC
  `);
  const rows = res.rows as Row[];

  const items: LegItem[] = [];
  const billGroups = new Map<string, Row[]>();

  for (const row of rows) {
    if (row.bill_id) {
      const group = billGroups.get(row.bill_id) ?? [];
      group.push(row);
      billGroups.set(row.bill_id, group);
    } else {
      const category = categoryForQuestion(row.question);
      items.push({
        key: row.rc_id,
        href: `/votes/${row.rc_id}`,
        category,
        chambers: [row.chamber],
        originChamber: row.chamber as "house" | "senate",
        label: row.question.replace(/^On the |^On /i, ""),
        title: row.question,
        date: row.vote_date,
        yea: row.yea,
        nay: row.nay,
        phase: votePhase(row.result),
      });
    }
  }

  for (const [billId, group] of billGroups) {
    const latest = group[0]; // rows are date-desc
    const billType = latest.bill_type!;
    items.push({
      key: billId,
      href: `/bills/${billId}`,
      category: categoryForBillType(billType),
      chambers: [...new Set(group.map((r) => r.chamber))],
      originChamber: billType.startsWith("h") ? "house" : "senate",
      label: `${billType.toUpperCase()} ${latest.bill_number}`,
      title: latest.bill_title ?? latest.question,
      date: latest.vote_date,
      yea: latest.yea,
      nay: latest.nay,
      phase: billPhase({
        status: latest.bill_status,
        rollCalls: group.map((r) => ({
          chamber: r.chamber,
          result: r.result,
          question: r.question,
        })),
      }),
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

export default async function BillsPage() {
  const items = await getItems();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-gray-900">Votes &amp; legislation</h1>
      <p className="mt-2 text-gray-600">
        Everything the current Congress has voted on — bills, resolutions,
        nominations, and motions.
      </p>
      <BillsBrowser items={items} />
    </div>
  );
}
