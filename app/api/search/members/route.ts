import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { legislators } from "@/db/schema";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ results: [] });
  }

  const byState =
    q.length === 2 ? eq(legislators.state, q.toUpperCase()) : undefined;

  const results = await db
    .select({
      id: legislators.id,
      fullName: legislators.fullName,
      party: legislators.party,
      state: legislators.state,
      district: legislators.district,
      chamber: legislators.chamber,
      photoUrl: legislators.photoUrl,
    })
    .from(legislators)
    .where(or(ilike(legislators.fullName, `%${q}%`), byState))
    .orderBy(desc(legislators.inOffice), sql`full_name`)
    .limit(8);

  return Response.json({ results });
}
