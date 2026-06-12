"use client";

import { MemberAvatar } from "@/components/member-avatar";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { partyAbbrev } from "@/lib/format";

type Result = {
  id: string;
  fullName: string;
  party: string;
  state: string;
  district: string | null;
  chamber: string;
  photoUrl: string | null;
};

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/members?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results: Result[] };
        setResults(data.results);
        setOpen(true);
      } catch {
        // aborted or offline — keep the previous results
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-xl">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) {
            setResults([]);
            setOpen(false);
          }
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            router.push(`/members/${results[0].id}`);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search a senator or representative…"
        aria-label="Search members of Congress"
        className="w-full rounded-full border-2 border-white/20 bg-white px-6 py-4 text-base text-gray-900 shadow-lg outline-none placeholder:text-gray-400 focus:border-flag-red"
      />
      {open && (
        <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-xl">
          {results.length === 0 ? (
            <li className="px-5 py-4 text-sm text-gray-500">
              No members match &ldquo;{query}&rdquo;
            </li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/members/${r.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-flag-blue-soft"
                >
                  <MemberAvatar
                    src={r.photoUrl}
                    name={r.fullName}
                    width={36}
                    height={44}
                    className="h-11 w-9 rounded bg-gray-100 object-cover text-xs"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">
                      {r.fullName}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {partyAbbrev(r.party)}-{r.state} ·{" "}
                      {r.chamber === "senate" ? "Senate" : "House"}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
