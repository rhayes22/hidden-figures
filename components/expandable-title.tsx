"use client";

import { useState } from "react";

// Long vote titles are clamped to 2 lines with a Show full / Show less
// toggle, so the full text is reachable on touch (not just hover).
export function ExpandableTitle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 70;
  return (
    <div className="mt-3">
      <h1
        className={`text-2xl font-bold text-gray-900 sm:text-3xl ${
          open || !long ? "" : "line-clamp-2"
        }`}
      >
        {text}
      </h1>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-sm font-medium text-flag-blue hover:underline"
        >
          {open ? "Show less" : "Show full title"}
        </button>
      )}
    </div>
  );
}
