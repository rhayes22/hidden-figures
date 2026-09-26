// Picking a bill's CRS summary out of what Congress.gov returns, and turning
// its HTML into the plain text stored in bills.summary.
//
// Pure by design — no database, no network, no script imports — because lib/
// is the only unit-tested layer (CLAUDE.md, "Conventions"). It returns values
// and never logs or throws; the sync and the backfill decide what to do with
// them. Same split as lib/tally.ts and lib/roster.ts.

export type ApiSummary = {
  actionDate: string;
  actionDesc: string;
  updateDate: string;
  versionCode: string;
  text: string;
};

// Picks the summary that describes the bill as it now stands: the greatest
// actionDate, ties broken by the greatest updateDate. Both are ISO-8601, so
// lexicographic comparison is chronological.
//
// versionCode is deliberately not sorted on — it is not ordinal. Measured on
// hr-1-119: Passed Senate is 55 on 2025-07-01, Public Law is 49 on 2025-07-04.
// The updateDate tie-break is load-bearing, not decorative: six bills in the
// corpus carry two summaries sharing an actionDate.
export function selectSummary(
  summaries: readonly ApiSummary[],
): ApiSummary | null {
  let best: ApiSummary | null = null;
  for (const candidate of summaries) {
    if (
      best === null ||
      candidate.actionDate > best.actionDate ||
      (candidate.actionDate === best.actionDate &&
        candidate.updateDate > best.updateDate)
    ) {
      best = candidate;
    }
  }
  return best;
}

// CRS HTML -> the plain text stored in bills.summary.
//
// Plain text, not HTML, for three reasons: the site would otherwise render
// third-party markup it does not control; lib/ is the only tested layer, so
// the conversion belongs where a test can reach it; and slice 6's trigram
// index wants words, not `<a href>`.
//
// The tag vocabulary is closed and measured across every summary of all 446
// bills that have one — p, li, ul, strong, em, a, br, b, i, sub — and the only
// entities are &nbsp; and &amp;. Block breaks are emitted before the generic
// tag strip, because stripping alone runs a list into the text on either side
// of it: the last item into the paragraph that follows (</ul>), and the first
// bullet onto the end of the sentence that introduces it (<ul>).
export function summaryToText(html: string): string {
  return html
    .replace(/<\s*p\b[^>]*>/gi, "\n\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*\/\s*ul\s*>/gi, "\n")
    .replace(/<\s*ul\b[^>]*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The two composed: what the sync and the backfill both store. A summary that
// strips to nothing yields null rather than "", so the column lands NULL.
export function summaryTextFor(
  summaries: readonly ApiSummary[],
): string | null {
  const picked = selectSummary(summaries);
  if (picked === null) return null;
  const text = summaryToText(picked.text);
  return text === "" ? null : text;
}
