// Shown during navigation while a route's server data loads.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="h-9 w-2/3 animate-pulse rounded bg-gray-200" />
      <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-gray-100" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-gray-100"
          />
        ))}
      </div>
    </div>
  );
}
