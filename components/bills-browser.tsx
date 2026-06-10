"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  phaseBadgeClass,
  type Category,
  type PhaseKind,
} from "@/lib/legislation";
import { formatDate } from "@/lib/format";

export type LegItem = {
  key: string;
  href: string;
  category: Category;
  chambers: string[];
  originChamber: "house" | "senate";
  label: string;
  title: string;
  date: string;
  yea: number;
  nay: number;
  phase: { label: string; kind: PhaseKind };
};

const TABS: Array<{ value: Category | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "bill", label: "Bills" },
  { value: "resolution", label: "Resolutions" },
  { value: "nomination", label: "Nominations" },
  { value: "motion", label: "Motions" },
  { value: "amendment", label: "Amendments" },
];

function Tally({ yea, nay }: { yea: number; nay: number }) {
  const total = yea + nay;
  return (
    <div className="w-40 shrink-0">
      <div className="flex justify-between text-xs font-semibold text-gray-600">
        <span>{yea}</span>
        <span>{nay}</span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-gray-100">
        {total > 0 && (
          <>
            <div
              className="bg-flag-blue"
              style={{ width: `${(yea / total) * 100}%` }}
            />
            <div
              className="bg-flag-red"
              style={{ width: `${(nay / total) * 100}%` }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function BillsBrowser({ items }: { items: LegItem[] }) {
  const [tab, setTab] = useState<Category | "all">("all");
  const [chamber, setChamber] = useState("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (tab !== "all" && it.category !== tab) return false;
      if (chamber !== "all" && !it.chambers.includes(chamber)) return false;
      if (q && !`${it.label} ${it.title}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [items, tab, chamber, query]);

  return (
    <div className="mt-6">
      {/* Type tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? "border-flag-red text-flag-blue"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            {counts[t.value] != null && (
              <span className="ml-1.5 text-xs text-gray-400">
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Secondary controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by number or title…"
          aria-label="Search legislation"
          className="min-w-0 flex-1 rounded-full border-2 border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:border-flag-red"
        />
        <select
          aria-label="Filter by chamber"
          value={chamber}
          onChange={(e) => setChamber(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
        >
          <option value="all">Both chambers</option>
          <option value="house">House</option>
          <option value="senate">Senate</option>
        </select>
      </div>

      <p className="mt-4 text-sm text-gray-500">
        {filtered.length} {filtered.length === 1 ? "result" : "results"}
      </p>

      <ul className="mt-3 space-y-3">
        {filtered.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href}
              className={`block rounded-xl border bg-white p-4 transition-shadow hover:shadow-md ${
                it.phase.kind === "law"
                  ? "border-amber-300"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 font-mono text-xs font-bold uppercase ${
                    it.originChamber === "senate"
                      ? "bg-flag-red-soft text-flag-red"
                      : "bg-flag-blue-soft text-flag-blue"
                  }`}
                >
                  {it.label}
                </span>
                <span className="text-xs text-gray-400">
                  {CATEGORY_LABEL[it.category]}
                </span>
                <span
                  className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${phaseBadgeClass(it.phase.kind)}`}
                >
                  {it.phase.kind === "law" ? "★ " : ""}
                  {it.phase.label}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-4">
                <p className="line-clamp-2 font-medium text-gray-900">
                  {it.title}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-xs text-gray-400">
                  {formatDate(it.date)}
                </span>
                <Tally yea={it.yea} nay={it.nay} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Nothing matches these filters.
        </p>
      )}
    </div>
  );
}
