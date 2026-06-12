"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  type Category,
  type PhaseKind,
} from "@/lib/legislation";
import { LegCard } from "@/components/leg-card";

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
      {/* Type tabs — segmented toggle */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            aria-current={tab === t.value}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.value
                ? "bg-white text-flag-blue shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            {counts[t.value] != null && (
              <span
                className={tab === t.value ? "text-gray-400" : "text-gray-400"}
              >
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
            <LegCard
              item={{
                href: it.href,
                label: it.label,
                category: CATEGORY_LABEL[it.category],
                chamber: it.originChamber,
                phaseLabel: it.phase.label,
                phaseKind: it.phase.kind,
                title: it.title,
                date: it.date,
                yea: it.yea,
                nay: it.nay,
              }}
            />
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
