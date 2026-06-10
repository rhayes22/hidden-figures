import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { legislators } from "@/db/schema";
import { partyAbbrev, partyBadgeClass, STATE_NAMES } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Members of Congress",
  description:
    "Every current U.S. senator and representative, by state, with links to their voting records.",
};

export default async function MembersPage() {
  const members = await db
    .select()
    .from(legislators)
    .where(eq(legislators.inOffice, true))
    .orderBy(asc(legislators.state), asc(legislators.chamber), asc(legislators.district));

  const byState = new Map<string, typeof members>();
  for (const member of members) {
    const list = byState.get(member.state) ?? [];
    list.push(member);
    byState.set(member.state, list);
  }
  const states = [...byState.keys()].sort((a, b) =>
    (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-gray-900">Members of Congress</h1>
      <p className="mt-2 text-gray-600">
        All {members.length} current voting members, by state. Senators are
        listed first.
      </p>
      <div className="mt-8 columns-1 gap-6 sm:columns-2 lg:columns-3">
        {states.map((state) => {
          const stateMembers = byState.get(state)!;
          const senators = stateMembers.filter((m) => m.chamber === "senate");
          const reps = stateMembers.filter((m) => m.chamber === "house");
          return (
            <section
              key={state}
              className="mb-6 break-inside-avoid rounded-xl border border-gray-200 bg-white p-5"
            >
              <h2 className="font-bold text-flag-blue">
                {STATE_NAMES[state] ?? state}
              </h2>
              <ul className="mt-3 space-y-1.5">
                {[...senators, ...reps].map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/members/${m.id}`}
                      className="group flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-medium text-gray-800 group-hover:text-flag-blue group-hover:underline">
                        {m.fullName}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
                        {m.chamber === "senate"
                          ? "Sen."
                          : m.district === "0"
                            ? "AL"
                            : `${m.state}-${m.district}`}
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold ${partyBadgeClass(m.party)}`}
                        >
                          {partyAbbrev(m.party)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
