// Canonical ID formats shared by the schema, ingestion, and URLs.
// Bill:      "hr-1234-119"        (type-number-congress)
// Roll call: "house-119-1-123"    (chamber-congress-session-roll)

import type { chamberEnum } from "@/db/schema";

export type Chamber = (typeof chamberEnum.enumValues)[number];

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

function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
}

export function makeBillId(
  billType: string,
  number: number,
  congress: number,
): string {
  const type = billType.toLowerCase().replace(/[.\s]/g, "");
  if (!BILL_TYPES.has(type)) {
    throw new Error(`Unknown bill type: ${billType}`);
  }
  assertPositiveInt(number, "number");
  assertPositiveInt(congress, "congress");
  return `${type}-${number}-${congress}`;
}

export function makeRollCallId(
  chamber: Chamber,
  congress: number,
  session: number,
  rollNumber: number,
): string {
  assertPositiveInt(congress, "congress");
  assertPositiveInt(session, "session");
  assertPositiveInt(rollNumber, "rollNumber");
  return `${chamber}-${congress}-${session}-${rollNumber}`;
}

export function parseBillId(id: string): {
  billType: string;
  number: number;
  congress: number;
} {
  const match = id.match(/^([a-z]+)-(\d+)-(\d+)$/);
  if (!match || !BILL_TYPES.has(match[1])) {
    throw new Error(`Invalid bill id: ${id}`);
  }
  return {
    billType: match[1],
    number: Number(match[2]),
    congress: Number(match[3]),
  };
}
