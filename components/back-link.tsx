"use client";

import { useRouter } from "next/navigation";

// Returns to the previous screen the user came from. Falls back to a fixed
// route when there's no history (e.g. a deep link or fresh tab).
export function BackLink({
  fallback = "/",
  label = "Back",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="inline-flex items-center gap-1 text-sm font-medium text-flag-blue hover:underline"
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}
