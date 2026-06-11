// Prominent pass/fail status tag, reusable for any vote result.

type Kind = "passed" | "failed" | "neutral";

function kindFor(result: string): Kind {
  if (/reject|fail|not agreed|negatived/i.test(result)) return "failed";
  if (/pass|agreed|confirm|adopt/i.test(result)) return "passed";
  return "neutral";
}

const STYLES: Record<Kind, { pill: string; dot: string }> = {
  passed: { pill: "bg-green-100 text-green-800", dot: "bg-green-500" },
  failed: { pill: "bg-flag-red-soft text-flag-red", dot: "bg-flag-red" },
  neutral: { pill: "bg-gray-100 text-gray-700", dot: "bg-gray-400" },
};

export function VoteStatusBadge({
  result,
  className = "",
}: {
  result: string;
  className?: string;
}) {
  const s = STYLES[kindFor(result)];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-sm font-bold uppercase tracking-wide ${s.pill} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {result}
    </span>
  );
}
