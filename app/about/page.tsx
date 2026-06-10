import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Methodology",
  description:
    "Where Hidden Figures gets its data, how often it updates, and its known limitations.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-gray-900">About &amp; methodology</h1>
      <p className="mt-4 text-lg text-gray-700">
        Hidden Figures makes it easy to see how members of the U.S. Congress
        actually vote. It is independent, nonpartisan, and built entirely on
        official public records.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900">Where the data comes from</h2>
        <ul className="mt-3 space-y-2 text-gray-700">
          <li>
            <strong>Votes</strong> — the official roll-call records published by
            the{" "}
            <a className="text-flag-blue hover:underline" href="https://clerk.house.gov/Votes" target="_blank" rel="noopener noreferrer">
              U.S. House Clerk
            </a>{" "}
            and the{" "}
            <a className="text-flag-blue hover:underline" href="https://www.senate.gov/legislative/votes_new.htm" target="_blank" rel="noopener noreferrer">
              U.S. Senate
            </a>
            .
          </li>
          <li>
            <strong>Members &amp; bills</strong> — the{" "}
            <a className="text-flag-blue hover:underline" href="https://www.congress.gov" target="_blank" rel="noopener noreferrer">
              Library of Congress (Congress.gov)
            </a>{" "}
            and the community-maintained{" "}
            <a className="text-flag-blue hover:underline" href="https://github.com/unitedstates/congress-legislators" target="_blank" rel="noopener noreferrer">
              unitedstates/congress-legislators
            </a>{" "}
            dataset, which is also the source of member portraits.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900">How often it updates</h2>
        <p className="mt-3 text-gray-700">
          An automated job runs nightly, pulling the current roster and the
          latest roll calls into the database. Vote tallies and member records
          typically reflect the previous legislative day.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900">Scope &amp; known limitations</h2>
        <ul className="mt-3 space-y-2 text-gray-700">
          <li>
            Coverage is the <strong>current (119th) Congress</strong> — the 535
            voting members of the House and Senate. Former members and earlier
            Congresses are not yet included.
          </li>
          <li>
            A vote shown as “not voting” reflects the official record and may
            mean an absence, a recusal, or a vacant seat.
          </li>
          <li>
            Not every roll call is on a bill — many are procedural motions or
            nominations, which are labeled by their question rather than a bill
            title.
          </li>
          <li>
            A small number of members may be temporarily missing from a vote’s
            roster while their identifiers are reconciled across data sources.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900">Corrections</h2>
        <p className="mt-3 text-gray-700">
          This is an independent project and not affiliated with any government
          body. If something looks wrong, it almost certainly traces back to one
          of the sources above — which is where to verify the official record.
        </p>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-flag-blue hover:underline">
          ← Back home
        </Link>
      </p>
    </div>
  );
}
