import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-sm font-semibold uppercase tracking-widest text-flag-red">
        404
      </p>
      <h1 className="mt-3 text-3xl font-bold text-gray-900">Page not found</h1>
      <p className="mt-2 text-gray-600">
        We couldn&rsquo;t find that member, bill, or vote.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-full bg-flag-blue px-6 py-3 font-semibold text-white hover:bg-flag-blue-deep"
        >
          Back to home
        </Link>
        <Link
          href="/members"
          className="rounded-full border border-gray-300 px-6 py-3 font-semibold text-flag-blue hover:bg-flag-blue-soft"
        >
          Browse members
        </Link>
      </div>
    </div>
  );
}
