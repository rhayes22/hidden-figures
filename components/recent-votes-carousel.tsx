"use client";

import { useEffect, useState } from "react";
import { LegCard, type LegCardItem } from "@/components/leg-card";

const INTERVAL_MS = 5000;

export function RecentVotesCarousel({ items }: { items: LegCardItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = items.length;

  const go = (i: number) => setIndex(((i % n) + n) % n);

  useEffect(() => {
    if (paused || n <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % n), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, n]);

  if (n === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="group"
      aria-roledescription="carousel"
      aria-label="Recent votes"
    >
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((it) => (
            <div key={it.href} className="h-44 w-full shrink-0 px-1">
              <LegCard item={it} large />
            </div>
          ))}
        </div>
      </div>

      {/* Prev / next */}
      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="Previous vote"
        className="absolute -left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-flag-blue shadow-md hover:bg-flag-blue-soft sm:-left-5"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="Next vote"
        className="absolute -right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-flag-blue shadow-md hover:bg-flag-blue-soft sm:-right-5"
      >
        ›
      </button>

      {/* Dots */}
      <div className="mt-5 flex justify-center gap-2">
        {items.map((it, i) => (
          <button
            key={it.href}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to vote ${i + 1}`}
            aria-current={i === index}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-6 bg-flag-blue" : "w-2 bg-gray-300 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
