"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/legislation";

export type CatStats = { votedOn: number; passed: number; failed: number };
export type Performance = Record<Category, CatStats>;
export type Parties = { d: number; r: number; i: number; total: number };
export type ChamberData = { parties: Parties; performance: Performance };

function PartySplit({ p }: { p: Parties }) {
  const pct = (n: number) => (p.total > 0 ? (n / p.total) * 100 : 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm font-medium">
        <span className="text-flag-blue">{p.d} Democrats</span>
        <span className="text-flag-red">{p.r} Republicans</span>
        {p.i > 0 && <span className="text-gray-600">{p.i} Independents</span>}
        <span className="ml-auto text-gray-400">{p.total} members</span>
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className="bg-flag-blue" style={{ width: `${pct(p.d)}%` }} />
        <div className="bg-gray-400" style={{ width: `${pct(p.i)}%` }} />
        <div className="bg-flag-red" style={{ width: `${pct(p.r)}%` }} />
      </div>
    </div>
  );
}

function PerformanceTable({ data }: { data: Performance }) {
  const totals = CATEGORIES.reduce(
    (acc, c) => ({
      votedOn: acc.votedOn + data[c].votedOn,
      passed: acc.passed + data[c].passed,
      failed: acc.failed + data[c].failed,
    }),
    { votedOn: 0, passed: 0, failed: 0 },
  );
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-400">
            <th className="pb-2 text-left font-semibold">Type</th>
            <th className="pb-2 text-right font-semibold">Voted on</th>
            <th className="pb-2 text-right font-semibold">Passed</th>
            <th className="pb-2 text-right font-semibold">Failed</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c} className="border-t border-gray-100">
              <td className="py-2 font-medium text-gray-800">
                {CATEGORY_LABEL[c]}s
              </td>
              <td className="py-2 text-right tabular-nums text-gray-700">
                {data[c].votedOn}
              </td>
              <td className="py-2 text-right font-medium tabular-nums text-green-700">
                {data[c].passed}
              </td>
              <td className="py-2 text-right font-medium tabular-nums text-flag-red">
                {data[c].failed}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200 font-bold text-gray-900">
            <td className="py-2">Total</td>
            <td className="py-2 text-right tabular-nums">{totals.votedOn}</td>
            <td className="py-2 text-right tabular-nums text-green-700">
              {totals.passed}
            </td>
            <td className="py-2 text-right tabular-nums text-flag-red">
              {totals.failed}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const TABS: Array<{ value: "house" | "senate"; label: string }> = [
  { value: "house", label: "House of Representatives" },
  { value: "senate", label: "Senate" },
];

export function ChamberBreakdown({
  house,
  senate,
}: {
  house: ChamberData;
  senate: ChamberData;
}) {
  const [tab, setTab] = useState<"house" | "senate">("house");
  const active = tab === "house" ? house : senate;
  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            aria-current={tab === t.value}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.value
                ? "border-flag-red text-flag-blue"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        <PartySplit p={active.parties} />
        <PerformanceTable data={active.performance} />
      </div>
    </div>
  );
}
