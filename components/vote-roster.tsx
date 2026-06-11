"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  partyAbbrev,
  partyBadgeClass,
  positionBadgeClass,
  positionLabel,
} from "@/lib/format";

export type RosterMember = {
  id: string;
  fullName: string;
  party: string;
  state: string;
  position: string;
};

const POSITION_ORDER: Record<string, number> = {
  yea: 0,
  nay: 1,
  present: 2,
  not_voting: 3,
};

const CAP = 50;

export function VoteRoster({ members }: { members: RosterMember[] }) {
  const [party, setParty] = useState("all");
  const [state, setState] = useState("all");
  const [position, setPosition] = useState("all");
  const [showAll, setShowAll] = useState(false);

  const states = useMemo(
    () => [...new Set(members.map((m) => m.state))].sort(),
    [members],
  );
  const parties = useMemo(
    () => [...new Set(members.map((m) => m.party))].sort(),
    [members],
  );

  const filtered = useMemo(
    () =>
      members
        .filter((m) => party === "all" || m.party === party)
        .filter((m) => state === "all" || m.state === state)
        .filter((m) => position === "all" || m.position === position)
        .sort(
          (a, b) =>
            POSITION_ORDER[a.position] - POSITION_ORDER[b.position] ||
            a.state.localeCompare(b.state) ||
            a.fullName.localeCompare(b.fullName),
        ),
    [members, party, state, position],
  );

  const visible = showAll ? filtered : filtered.slice(0, CAP);

  const selectClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Filter by party"
          className={selectClass}
          value={party}
          onChange={(e) => setParty(e.target.value)}
        >
          <option value="all">All parties</option>
          {parties.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by position"
          className={selectClass}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        >
          <option value="all">All positions</option>
          <option value="yea">Yea</option>
          <option value="nay">Nay</option>
          <option value="present">Present</option>
          <option value="not_voting">Not Voting</option>
        </select>
        <select
          aria-label="Filter by state"
          className={selectClass}
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="all">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filtered.length} of {members.length}
        </span>
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {visible.map((m) => (
          <li key={m.id}>
            <Link
              href={`/members/${m.id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-flag-blue-soft/60"
            >
              <span
                className={`w-20 shrink-0 rounded-full px-2 py-1 text-center text-xs font-bold ${positionBadgeClass(m.position)}`}
              >
                {positionLabel(m.position)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                {m.fullName}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${partyBadgeClass(m.party)}`}
              >
                {partyAbbrev(m.party)}-{m.state}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length > CAP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-flag-blue hover:bg-flag-blue-soft"
        >
          {showAll
            ? "Show fewer"
            : `Show all ${filtered.length} members`}
        </button>
      )}
      {filtered.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          No members match these filters.
        </p>
      )}
    </div>
  );
}
