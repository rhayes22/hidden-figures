"use client";

import Image from "next/image";
import { useState } from "react";

function initials(name: string): string {
  const parts = name
    .replace(/\b(Jr\.?|Sr\.?|III|II|IV)\b/g, "")
    .split(/\s+/)
    .filter((p) => p && /[A-Za-z]/.test(p[0]));
  if (parts.length === 0) return "?";
  // First + last name initials (skip middle names/initials).
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Member portrait that falls back to initials when the source is missing or
// 404s (some new members have no upstream photo yet).
export function MemberAvatar({
  src,
  name,
  width,
  height,
  className = "",
  priority = false,
}: {
  src: string | null;
  name: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center bg-flag-blue-soft font-bold text-flag-blue ${className}`}
      >
        {initials(name) || "?"}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={width}
      height={height}
      priority={priority}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
