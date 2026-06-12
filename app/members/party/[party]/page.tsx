import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { legislators } from "@/db/schema";
import { BackLink } from "@/components/back-link";
import { MemberList, type MemberRow } from "@/components/member-list";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ party: string }> };

// URL slug -> display + DB filter. Independents are everyone not D/R.
const PARTIES = {
  republican: { label: "Republicans", color: "text-flag-red" },
  democrat: { label: "Democrats", color: "text-flag-blue" },
  independent: { label: "Independents", color: "text-gray-700" },
} as const;

type PartySlug = keyof typeof PARTIES;

function isPartySlug(s: string): s is PartySlug {
  return s === "republican" || s === "democrat" || s === "independent";
}

async function getMembers(slug: PartySlug): Promise<MemberRow[]> {
  const where =
    slug === "independent"
      ? and(
          eq(legislators.inOffice, true),
          ne(legislators.party, "Democrat"),
          ne(legislators.party, "Republican"),
        )
      : and(
          eq(legislators.inOffice, true),
          eq(legislators.party, slug === "republican" ? "Republican" : "Democrat"),
        );

  return db
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
    .where(where)
    .orderBy(sql`full_name`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { party } = await params;
  if (!isPartySlug(party)) return { title: "Members" };
  return {
    title: `${PARTIES[party].label} of the 119th Congress`,
    description: `Every ${PARTIES[party].label.toLowerCase().replace(/s$/, "")} member of the current U.S. Congress, filterable by chamber and state.`,
  };
}

export default async function PartyMembersPage({ params }: Props) {
  const { party } = await params;
  if (!isPartySlug(party)) notFound();
  const members = await getMembers(party);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <BackLink fallback="/" />
      <h1 className="mt-4 text-3xl font-bold text-gray-900">
        <span className={PARTIES[party].color}>{PARTIES[party].label}</span> of
        the 119th Congress
      </h1>
      <p className="mt-2 text-gray-600">
        {members.length} members. Filter by chamber and state.
      </p>
      <div className="mt-6">
        <MemberList members={members} />
      </div>
    </div>
  );
}
