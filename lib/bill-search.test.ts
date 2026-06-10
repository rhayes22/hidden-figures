import { describe, expect, it } from "vitest";
import { parseBillQuery } from "./bill-search";

describe("parseBillQuery", () => {
  it("parses type + number in several spellings", () => {
    expect(parseBillQuery("HR 1234")).toEqual({ billType: "hr", number: 1234 });
    expect(parseBillQuery("hr1234")).toEqual({ billType: "hr", number: 1234 });
    expect(parseBillQuery("S.5")).toEqual({ billType: "s", number: 5 });
    expect(parseBillQuery("H.J.Res. 7")).toEqual({
      billType: "hjres",
      number: 7,
    });
  });

  it("parses a bare number", () => {
    expect(parseBillQuery("1234")).toEqual({ number: 1234 });
  });

  it("returns null for free-text (title search)", () => {
    expect(parseBillQuery("infrastructure")).toBeNull();
    expect(parseBillQuery("")).toBeNull();
    expect(parseBillQuery("xyz 12")).toBeNull();
  });
});
