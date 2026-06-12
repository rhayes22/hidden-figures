"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import {
  partyAbbrev,
  partyBadgeClass,
  seatLabel,
  STATE_NAMES,
} from "@/lib/format";

export type MemberRow = {
  id: string;
  fullName: string;
  party: string;
  state: string;
  district: string | null;
  chamber: string;
  photoUrl: string | null;
};

export function MemberList({ members }: { members: MemberRow[] }) {
  const [chamber, setChamber] = useState("all");
  const [state, setState] = useState("all");

  const states = useMemo(
    () => [...new Set(members.map((m) => m.state))].sort(),
    [members],
  );

  const filtered = useMemo(
    () =>
      members
        .filter((m) => chamber === "all" || m.chamber === chamber)
        .filter((m) => state === "all" || m.state === state)
        .sort(
          (a, b) =>
            a.state.localeCompare(b.state) ||
            (a.chamber === b.chamber ? 0 : a.chamber === "senate" ? -1 : 1) ||
            a.fullName.localeCompare(b.fullName),
        ),
    [members, chamber, state],
  );

  const selectClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Filter by chamber"
          value={chamber}
          onChange={(e) => setChamber(e.target.value)}
          className={selectClass}
        >
          <option value="all">Both chambers</option>
          <option value="house">House</option>
          <option value="senate">Senate</option>
        </select>
        <select
          aria-label="Filter by state"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className={selectClass}
        >
          <option value="all">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {STATE_NAMES[s] ?? s}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filtered.length} {filtered.length === 1 ? "member" : "members"}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {filtered.map((m) => (
          <li key={m.id}>
            <Link
              href={`/members/${m.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-flag-blue-soft/50"
            >
              <MemberAvatar
                src={m.photoUrl}
                name={m.fullName}
                width={40}
                height={49}
                className="h-12 w-10 shrink-0 rounded bg-gray-100 object-cover text-sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-gray-900">
                  {m.fullName}
                </span>
                <span className="block text-xs text-gray-500">
                  {seatLabel(m)}
                </span>
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
      {filtered.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">No members match these filters.</p>
      )}
    </div>
  );
}
