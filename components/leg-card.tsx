import Link from "next/link";
import { phaseBadgeClass, type PhaseKind } from "@/lib/legislation";
import { formatDate } from "@/lib/format";

export type LegCardItem = {
  href: string;
  label: string; // "HR 5408" or a short question label
  category?: string; // "Bill", "Nomination", …
  chamber: "house" | "senate";
  phaseLabel: string;
  phaseKind: PhaseKind;
  title: string;
  date: string;
  yea: number;
  nay: number;
};

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

export function LegCard({ item }: { item: LegCardItem }) {
  return (
    <Link
      href={item.href}
      className={`block h-full rounded-xl border bg-white p-4 transition-shadow hover:shadow-md ${
        item.phaseKind === "law" ? "border-amber-300" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 font-mono text-xs font-bold uppercase ${
            item.chamber === "senate"
              ? "bg-flag-red-soft text-flag-red"
              : "bg-flag-blue-soft text-flag-blue"
          }`}
        >
          {item.label}
        </span>
        {item.category && (
          <span className="text-xs text-gray-400">{item.category}</span>
        )}
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${phaseBadgeClass(item.phaseKind)}`}
        >
          {item.phaseKind === "law" ? "★ " : ""}
          {item.phaseLabel}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 font-medium text-gray-900">{item.title}</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-xs text-gray-400">{formatDate(item.date)}</span>
        <Tally yea={item.yea} nay={item.nay} />
      </div>
    </Link>
  );
}
