import { describe, expect, it } from "vitest";
import { makeBillId, makeRollCallId, parseBillId } from "./ids";

describe("makeBillId", () => {
  it("builds the canonical id", () => {
    expect(makeBillId("hr", 1234, 119)).toBe("hr-1234-119");
    expect(makeBillId("s", 5, 119)).toBe("s-5-119");
  });

  it("normalizes casing and punctuation from upstream formats", () => {
    // Congress.gov uses "HR"; House Clerk XML uses "H R"; some feeds use "H.R."
    expect(makeBillId("HR", 1234, 119)).toBe("hr-1234-119");
    expect(makeBillId("H R", 1234, 119)).toBe("hr-1234-119");
    expect(makeBillId("H.J.RES", 7, 119)).toBe("hjres-7-119");
  });

  it("rejects unknown bill types", () => {
    expect(() => makeBillId("xyz", 1, 119)).toThrow(/Unknown bill type/);
  });

  it("rejects non-positive or non-integer numbers", () => {
    expect(() => makeBillId("hr", 0, 119)).toThrow(/positive integer/);
    expect(() => makeBillId("hr", 1.5, 119)).toThrow(/positive integer/);
    expect(() => makeBillId("hr", 1, -119)).toThrow(/positive integer/);
  });
});

describe("makeRollCallId", () => {
  it("builds the canonical id", () => {
    expect(makeRollCallId("house", 119, 1, 123)).toBe("house-119-1-123");
    expect(makeRollCallId("senate", 119, 2, 17)).toBe("senate-119-2-17");
  });

  it("rejects invalid numeric parts", () => {
    expect(() => makeRollCallId("house", 119, 0, 123)).toThrow(
      /positive integer/,
    );
  });
});

describe("parseBillId", () => {
  it("round-trips with makeBillId", () => {
    expect(parseBillId(makeBillId("HR", 1234, 119))).toEqual({
      billType: "hr",
      number: 1234,
      congress: 119,
    });
  });

  it("rejects malformed ids", () => {
    expect(() => parseBillId("hr-1234")).toThrow(/Invalid bill id/);
    expect(() => parseBillId("xyz-1-119")).toThrow(/Invalid bill id/);
    expect(() => parseBillId("house-119-1-123")).toThrow(/Invalid bill id/);
  });
});
