import { describe, expect, it } from "vitest";
import {
  billIdFor,
  congressForYear,
  normalizePosition,
  parseHouseVote,
  parseSenateVote,
  parseSenateVoteMenu,
  parseVoteDate,
  sessionForYear,
} from "./votes";

const houseXml = `<?xml version="1.0"?>
<rollcall-vote>
  <vote-metadata>
    <congress>119</congress>
    <session>2nd</session>
    <chamber>U.S. House of Representatives</chamber>
    <rollcall-num>123</rollcall-num>
    <legis-num>H R 22</legis-num>
    <vote-question>On Passage</vote-question>
    <vote-type>YEA-AND-NAY</vote-type>
    <vote-result>Passed</vote-result>
    <action-date>10-Jun-2026</action-date>
  </vote-metadata>
  <vote-data>
    <recorded-vote><legislator name-id="A000055">Aderholt</legislator><vote>Yea</vote></recorded-vote>
    <recorded-vote><legislator name-id="B001230">Baldwin</legislator><vote>Nay</vote></recorded-vote>
    <recorded-vote><legislator name-id="C001234">Carter</legislator><vote>Not Voting</vote></recorded-vote>
  </vote-data>
</rollcall-vote>`;

const senateXml = `<?xml version="1.0"?>
<roll_call_vote>
  <congress>119</congress>
  <session>2</session>
  <congress_year>2026</congress_year>
  <vote_number>45</vote_number>
  <vote_date>June 9, 2026, 05:30 PM</vote_date>
  <question>On Passage of the Bill</question>
  <vote_result>Passed</vote_result>
  <document>
    <document_type>S.</document_type>
    <document_number>1234</document_number>
  </document>
  <members>
    <member><member_full>Warren (D-MA)</member_full><lis_member_id>S366</lis_member_id><vote_cast>Yea</vote_cast></member>
    <member><member_full>Young (R-IN)</member_full><lis_member_id>S391</lis_member_id><vote_cast>Present, Giving Live Pair</vote_cast></member>
  </members>
</roll_call_vote>`;

const senateMenuXml = `<?xml version="1.0"?>
<vote_summary>
  <congress>119</congress>
  <session>2</session>
  <votes>
    <vote><vote_number>00045</vote_number><question>On Passage</question></vote>
    <vote><vote_number>00044</vote_number><question>On the Nomination</question></vote>
  </votes>
</vote_summary>`;

describe("parseHouseVote", () => {
  const parsed = parseHouseVote(houseXml);

  it("extracts metadata and the canonical id", () => {
    expect(parsed).toMatchObject({
      id: "house-119-2-123",
      chamber: "house",
      congress: 119,
      session: 2,
      rollNumber: 123,
      voteDate: "2026-06-10",
      question: "On Passage",
      result: "Passed",
      billId: "hr-22-119",
    });
  });

  it("extracts per-member positions keyed by bioguide id", () => {
    expect(parsed.positions).toEqual([
      { memberId: "A000055", position: "yea" },
      { memberId: "B001230", position: "nay" },
      { memberId: "C001234", position: "not_voting" },
    ]);
  });
});

describe("parseSenateVote", () => {
  const parsed = parseSenateVote(senateXml);

  it("extracts metadata and links the bill", () => {
    expect(parsed).toMatchObject({
      id: "senate-119-2-45",
      chamber: "senate",
      session: 2,
      rollNumber: 45,
      voteDate: "2026-06-09",
      billId: "s-1234-119",
    });
  });

  it("keys positions by LIS id and normalizes live pairs to present", () => {
    expect(parsed.positions).toEqual([
      { memberId: "S366", position: "yea" },
      { memberId: "S391", position: "present" },
    ]);
  });
});

describe("parseSenateVoteMenu", () => {
  it("lists vote numbers", () => {
    expect(parseSenateVoteMenu(senateMenuXml)).toEqual([45, 44]);
  });
});

describe("billIdFor", () => {
  it("handles both chambers' formats", () => {
    expect(billIdFor("H R 22", 119)).toBe("hr-22-119");
    expect(billIdFor("H J RES 7", 119)).toBe("hjres-7-119");
    expect(billIdFor("S.J.Res. 7", 119)).toBe("sjres-7-119");
  });

  it("returns null for nominations and non-bill votes", () => {
    expect(billIdFor("PN1234", 119)).toBeNull();
    expect(billIdFor(undefined, 119)).toBeNull();
    expect(billIdFor("", 119)).toBeNull();
  });
});

describe("normalizePosition", () => {
  it("maps the chambers' variants onto the enum", () => {
    expect(normalizePosition("Aye")).toBe("yea");
    expect(normalizePosition("No")).toBe("nay");
    expect(normalizePosition("Present, Giving Live Pair")).toBe("present");
    expect(normalizePosition("Not Voting")).toBe("not_voting");
  });
});

describe("congress/session math", () => {
  it("derives congress and session from the year", () => {
    expect(congressForYear(2026)).toBe(119);
    expect(congressForYear(2025)).toBe(119);
    expect(sessionForYear(2025)).toBe(1);
    expect(sessionForYear(2026)).toBe(2);
  });
});

describe("parseVoteDate", () => {
  it("parses the formats both chambers use", () => {
    expect(parseVoteDate("10-Jun-2026")).toBe("2026-06-10");
    expect(parseVoteDate("June 9, 2026, 05:30 PM")).toBe("2026-06-09");
    expect(parseVoteDate("9-Jun", 2026)).toBe("2026-06-09");
  });

  it("throws on garbage rather than guessing", () => {
    expect(() => parseVoteDate("sometime")).toThrow(/Unrecognized/);
  });
});
