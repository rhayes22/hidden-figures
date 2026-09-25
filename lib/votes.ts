// Parsers for the two chambers' roll-call XML feeds.
// House: https://clerk.house.gov/evs/{year}/roll{NNN}.xml (member key: bioguide)
// Senate: https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/
//         vote_{congress}_{session}_{NNNNN}.xml (member key: LIS id)

import { XMLParser } from "fast-xml-parser";
import { makeBillId, makeRollCallId, type Chamber } from "./ids";

export type ParsedPosition = "yea" | "nay" | "present" | "not_voting";

export type ParsedRollCall = {
  id: string;
  chamber: Chamber;
  congress: number;
  session: number;
  rollNumber: number;
  voteDate: string; // YYYY-MM-DD
  question: string;
  result: string;
  // Plain-English subject of the vote, when the chamber publishes one.
  description: string | null;
  resultText: string | null;
  billId: string | null;
  // The chamber's own count of the vote, as published in the same document.
  tally: PublishedTally;
  // House: bioguide ids. Senate: LIS ids (crosswalk to bioguide happens in the sync).
  positions: Array<{ memberId: string; position: ParsedPosition }>;
};

const parser = new XMLParser({ ignoreAttributes: false });

export function congressForYear(year: number): number {
  return Math.floor((year - 1789) / 2) + 1;
}

export function sessionForYear(year: number): number {
  return year % 2 === 1 ? 1 : 2;
}

export function normalizePosition(raw: string): ParsedPosition {
  const value = raw.trim().toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "yea";
  if (value === "nay" || value === "no") return "nay";
  if (value.startsWith("present")) return "present";
  return "not_voting";
}

// Phrases both chambers publish in place of an absent value. Carrying them
// through would be worse than showing nothing.
const FILLER_PHRASES = new Set([
  "no statement of purpose on file",
  "no statement of purpose",
  "no short title on file",
  "no title available",
]);

// Normalizes a raw XML value to displayable text, or null when the source
// has nothing to say. Empty elements parse as "", and a missing element
// stringifies to "undefined" — neither may reach the database.
export function normalizeText(raw: unknown): string | null {
  // The parser keeps attributes and nests children, so an element that gains
  // either becomes an object (or an array of them); coercing that would yield
  // "[object Object]", which is non-empty and would short-circuit the chain.
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim().replace(/\s+/g, " ");
  if (text === "" || text === "undefined") return null;
  if (FILLER_PHRASES.has(text.toLowerCase().replace(/\.$/, ""))) return null;
  return text;
}

// "H R 22", "H RES 57", "S. 1234", "S.J.Res. 7" -> bill id; nominations
// (PN...), treaties, and other non-bill identifiers -> null.
export function billIdFor(
  raw: string | undefined | null,
  congress: number,
): string | null {
  if (!raw) return null;
  const cleaned = String(raw)
    .toLowerCase()
    .replace(/[.\s]/g, "")
    .match(/^([a-z]+)(\d+)$/);
  if (!cleaned) return null;
  try {
    return makeBillId(cleaned[1], Number(cleaned[2]), congress);
  } catch {
    return null;
  }
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Handles "10-Jun-2026", "June 10, 2026, 05:30 PM", and "10-Jun" (+fallback year).
export function parseVoteDate(raw: string, fallbackYear?: number): string {
  const value = raw.trim();

  let m = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  }

  m = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (month) return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
  }

  m = value.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (m && fallbackYear) {
    return `${fallbackYear}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  }

  throw new Error(`Unrecognized vote date: ${raw}`);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// --- Published tallies -------------------------------------------------------
// Both chambers print their own count of the vote alongside the per-member
// positions. It is the only number in the document that is independent of the
// per-member list, so it is the only thing that can check the parse.
// lib/tally.ts does the comparing; this only reads what was published.

export type PublishedTally =
  | {
      kind: "buckets";
      yea: number;
      nay: number;
      present: number;
      notVoting: number;
    }
  | { kind: "total"; total: number }
  | { kind: "none" }
  | { kind: "malformed"; reason: string };

type TallyField =
  | { kind: "absent" }
  | { kind: "number"; value: number }
  | { kind: "malformed"; reason: string };

// A missing element parses to undefined and an empty one (`<present/>`) to "".
// Both mean the chamber printed no number, which is not the same as printing
// a zero — only a tally with at least one number present reads absences as 0.
function tallyField(raw: unknown, label: string): TallyField {
  if (raw === undefined || raw === null) return { kind: "absent" };
  if (typeof raw === "number") {
    return Number.isInteger(raw)
      ? { kind: "number", value: raw }
      : { kind: "malformed", reason: `${label} is not a whole number: ${raw}` };
  }
  if (typeof raw !== "string") {
    return { kind: "malformed", reason: `${label} is not a number` };
  }
  const text = raw.trim();
  if (text === "") return { kind: "absent" };
  if (!/^\d+$/.test(text)) {
    return { kind: "malformed", reason: `${label} is not a number: ${text}` };
  }
  return { kind: "number", value: Number(text) };
}

type Buckets = {
  yea: number;
  nay: number;
  present: number;
  notVoting: number;
};

type BucketRead =
  | { kind: "buckets"; buckets: Buckets }
  | { kind: "none" }
  | { kind: "malformed"; reason: string };

function readBuckets(
  raws: [unknown, unknown, unknown, unknown],
  labels: [string, string, string, string],
): BucketRead {
  const values: number[] = [];
  let anyPresent = false;
  for (let i = 0; i < 4; i++) {
    const field = tallyField(raws[i], labels[i]);
    if (field.kind === "malformed") {
      return { kind: "malformed", reason: field.reason };
    }
    if (field.kind === "number") anyPresent = true;
    values.push(field.kind === "number" ? field.value : 0);
  }
  if (!anyPresent) return { kind: "none" };
  return {
    kind: "buckets",
    buckets: {
      yea: values[0],
      nay: values[1],
      present: values[2],
      notVoting: values[3],
    },
  };
}

function bucketLine(b: Buckets): string {
  return `yea=${b.yea} nay=${b.nay} present=${b.present} not_voting=${b.notVoting}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

// Senate: <count><yeas>51</yeas><nays>47</nays><present/><absent>2</absent></count>
function senateTally(count: unknown): PublishedTally {
  const c = asRecord(count);
  if (!c) return { kind: "none" };
  const read = readBuckets(
    [c.yeas, c.nays, c.present, c.absent],
    ["yeas", "nays", "present", "absent"],
  );
  if (read.kind !== "buckets") return read;
  return { kind: "buckets", ...read.buckets };
}

const HOUSE_BUCKET_KEYS: [string, string, string, string] = [
  "yea-total",
  "nay-total",
  "present-total",
  "not-voting-total",
];

// House: <vote-totals> carries per-party rows, a <totals-by-vote> row, or —
// for a Speaker election — per-candidate rows and no yea/nay row at all.
function houseTally(voteTotals: unknown): PublishedTally {
  const totals = asRecord(voteTotals);
  if (!totals) return { kind: "none" };

  const byVote = asRecord(asArray(totals["totals-by-vote"])[0]);
  if (byVote) {
    const read = readBuckets(
      [
        byVote[HOUSE_BUCKET_KEYS[0]],
        byVote[HOUSE_BUCKET_KEYS[1]],
        byVote[HOUSE_BUCKET_KEYS[2]],
        byVote[HOUSE_BUCKET_KEYS[3]],
      ],
      HOUSE_BUCKET_KEYS,
    );
    if (read.kind !== "buckets") return read;

    const partyRows = asArray(totals["totals-by-party"]);
    if (partyRows.length > 0) {
      const summed: Buckets = { yea: 0, nay: 0, present: 0, notVoting: 0 };
      for (const row of partyRows) {
        const party = asRecord(row);
        if (!party) {
          return { kind: "malformed", reason: "totals-by-party row is not readable" };
        }
        const partyRead = readBuckets(
          [
            party[HOUSE_BUCKET_KEYS[0]],
            party[HOUSE_BUCKET_KEYS[1]],
            party[HOUSE_BUCKET_KEYS[2]],
            party[HOUSE_BUCKET_KEYS[3]],
          ],
          HOUSE_BUCKET_KEYS,
        );
        if (partyRead.kind === "malformed") return partyRead;
        if (partyRead.kind === "none") continue;
        summed.yea += partyRead.buckets.yea;
        summed.nay += partyRead.buckets.nay;
        summed.present += partyRead.buckets.present;
        summed.notVoting += partyRead.buckets.notVoting;
      }
      const b = read.buckets;
      if (
        summed.yea !== b.yea ||
        summed.nay !== b.nay ||
        summed.present !== b.present ||
        summed.notVoting !== b.notVoting
      ) {
        return {
          kind: "malformed",
          reason: `totals-by-party sums to ${bucketLine(summed)} but totals-by-vote says ${bucketLine(b)}`,
        };
      }
    }
    return { kind: "buckets", ...read.buckets };
  }

  // A Speaker election publishes a count per candidate and no yea/nay row.
  const candidates = asArray(totals["totals-by-candidate"]);
  if (candidates.length > 0) {
    let total = 0;
    for (const row of candidates) {
      const candidate = asRecord(row);
      if (!candidate) {
        return { kind: "malformed", reason: "totals-by-candidate row is not readable" };
      }
      const field = tallyField(candidate["candidate-total"], "candidate-total");
      if (field.kind === "malformed") {
        return { kind: "malformed", reason: field.reason };
      }
      if (field.kind === "number") total += field.value;
    }
    return { kind: "total", total };
  }

  return { kind: "none" };
}

// Reading a tally must never take down a run: one unreadable document is
// quarantined, not fatal to the other 1,572.
function tallyOrMalformed(read: () => PublishedTally): PublishedTally {
  try {
    return read();
  } catch (err) {
    return {
      kind: "malformed",
      reason: `tally unreadable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function parseHouseVote(xml: string): ParsedRollCall {
  const doc = parser.parse(xml);
  const meta = doc["rollcall-vote"]["vote-metadata"];
  const congress = Number(meta.congress);
  const session = Number(String(meta.session).replace(/\D/g, ""));
  const rollNumber = Number(meta["rollcall-num"]);

  const positions = asArray(
    doc["rollcall-vote"]["vote-data"]["recorded-vote"],
  ).map((entry: { legislator: { "@_name-id": string }; vote: string }) => ({
    memberId: entry.legislator["@_name-id"],
    position: normalizePosition(String(entry.vote)),
  }));

  return {
    id: makeRollCallId("house", congress, session, rollNumber),
    chamber: "house",
    congress,
    session,
    rollNumber,
    voteDate: parseVoteDate(String(meta["action-date"])),
    question: String(meta["vote-question"]),
    result: String(meta["vote-result"]),
    // vote-desc is empty precisely on amendment votes, which name the
    // sponsor in amendment-author instead.
    description:
      normalizeText(meta["vote-desc"]) ??
      normalizeText(meta["amendment-author"]),
    // The House publishes no single result-text string.
    resultText: null,
    billId: billIdFor(meta["legis-num"], congress),
    tally: tallyOrMalformed(() => houseTally(meta["vote-totals"])),
    positions,
  };
}

export function parseSenateVote(xml: string): ParsedRollCall {
  const doc = parser.parse(xml);
  const vote = doc.roll_call_vote;
  const congress = Number(vote.congress);
  const session = Number(vote.session);
  const rollNumber = Number(vote.vote_number);

  const docType = vote.document?.document_type;
  const docNumber = vote.document?.document_number;
  const documentBillId =
    docType !== undefined && docNumber !== undefined
      ? billIdFor(`${docType}${docNumber}`, congress)
      : null;
  // Amendment votes carry no document number of their own; the bill they
  // amend is the only link back to legislation.
  const billId =
    documentBillId ??
    billIdFor(vote.amendment?.amendment_to_document_number, congress);

  const positions = asArray(vote.members?.member).map(
    (entry: { lis_member_id: string; vote_cast: string }) => ({
      memberId: String(entry.lis_member_id),
      position: normalizePosition(String(entry.vote_cast)),
    }),
  );

  return {
    id: makeRollCallId("senate", congress, session, rollNumber),
    chamber: "senate",
    congress,
    session,
    rollNumber,
    voteDate: parseVoteDate(
      String(vote.vote_date),
      Number(vote.congress_year) || undefined,
    ),
    question: String(vote.question),
    result: String(vote.vote_result),
    description:
      normalizeText(vote.vote_document_text) ??
      normalizeText(vote.document?.document_title) ??
      normalizeText(vote.amendment?.amendment_purpose) ??
      normalizeText(vote.vote_title),
    resultText: normalizeText(vote.vote_result_text),
    billId,
    tally: tallyOrMalformed(() => senateTally(vote.count)),
    positions,
  };
}

// The Senate publishes a per-session index of all votes.
export function parseSenateVoteMenu(xml: string): number[] {
  const doc = parser.parse(xml);
  return asArray(doc.vote_summary?.votes?.vote).map(
    (v: { vote_number: number | string }) => Number(v.vote_number),
  );
}
