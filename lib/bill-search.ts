// Parses a bill-search query. Returns a structured match for number-style
// queries ("HR 1234", "s.5", "1234"), or null for free-text title search.

const BILL_TYPES = new Set([
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
]);

export type BillQuery = { billType?: string; number: number } | null;

export function parseBillQuery(raw: string): BillQuery {
  const cleaned = raw.trim().toLowerCase().replace(/[.\s]/g, "");
  if (!cleaned) return null;

  // type + number, e.g. "hr1234"
  const typed = cleaned.match(/^([a-z]+)(\d+)$/);
  if (typed && BILL_TYPES.has(typed[1])) {
    return { billType: typed[1], number: Number(typed[2]) };
  }

  // bare number, e.g. "1234"
  if (/^\d+$/.test(cleaned)) {
    return { number: Number(cleaned) };
  }

  return null;
}
