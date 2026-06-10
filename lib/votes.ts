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
  billId: string | null;
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
    billId: billIdFor(meta["legis-num"], congress),
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
  const billId =
    docType !== undefined && docNumber !== undefined
      ? billIdFor(`${docType}${docNumber}`, congress)
      : null;

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
    billId,
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
