import { describe, expect, it } from "vitest";
import {
  billIdFor,
  congressForYear,
  normalizePosition,
  normalizeText,
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

// Reductions of real documents, field names and values verified against the
// live feeds on 2026-09-18.

// vote_119_1_00532.xml — confirmation of a nominee.
const senateNominationXml = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress>119</congress>
  <session>1</session>
  <congress_year>2025</congress_year>
  <vote_number>532</vote_number>
  <vote_date>September 29, 2025,  08:19 PM</vote_date>
  <vote_question_text>On the Nomination PN342</vote_question_text>
  <vote_document_text>Michael G. Waltz, of Florida, to be Representative of the United States of America to the Sessions of the General Assembly of the United Nations</vote_document_text>
  <vote_result_text>Nomination Confirmed (54-45)</vote_result_text>
  <question>On the Nomination</question>
  <vote_title>Confirmation: Michael G. Waltz, of Florida</vote_title>
  <vote_result>Nomination Confirmed</vote_result>
  <document>
    <document_type>PN</document_type>
    <document_number>342</document_number>
    <document_name>PN342</document_name>
    <document_title>Michael G. Waltz, of Florida, to be Representative of the United States of America to the Sessions of the General Assembly of the United Nations</document_title>
    <document_short_title/>
  </document>
  <amendment>
    <amendment_number/>
    <amendment_to_document_number/>
    <amendment_purpose>No Statement of Purpose on File.</amendment_purpose>
  </amendment>
  <members>
    <member><lis_member_id>S366</lis_member_id><vote_cast>Nay</vote_cast></member>
  </members>
</roll_call_vote>`;

// vote_119_1_00300.xml — cloture on a nomination; document_number "12-43"
// is not a bill number.
const senateClotureXml = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress>119</congress>
  <session>1</session>
  <congress_year>2025</congress_year>
  <vote_number>300</vote_number>
  <vote_date>June 10, 2025,  11:53 AM</vote_date>
  <vote_question_text>On the Cloture Motion PN12-43</vote_question_text>
  <vote_document_text>Stephen Vaden, of Tennessee, to be Deputy Secretary of Agriculture</vote_document_text>
  <vote_result_text>Cloture Motion Agreed to (48-45)</vote_result_text>
  <question>On the Cloture Motion</question>
  <vote_title>Motion to Invoke Cloture: Stephen Vaden to be Deputy Secretary of Agriculture</vote_title>
  <vote_result>Cloture Motion Agreed to</vote_result>
  <document>
    <document_type>PN</document_type>
    <document_number>12-43</document_number>
    <document_name>PN12-43</document_name>
    <document_title>Stephen Vaden, of Tennessee, to be Deputy Secretary of Agriculture</document_title>
    <document_short_title/>
  </document>
  <amendment>
    <amendment_number/>
    <amendment_to_document_number/>
    <amendment_purpose>No Statement of Purpose on File.</amendment_purpose>
  </amendment>
  <members>
    <member><lis_member_id>S391</lis_member_id><vote_cast>Yea</vote_cast></member>
  </members>
</roll_call_vote>`;

// vote_119_1_00568.xml — an amendment whose only link to legislation is
// amendment_to_document_number.
const senateAmendmentXml = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress>119</congress>
  <session>1</session>
  <congress_year>2025</congress_year>
  <vote_number>568</vote_number>
  <vote_date>October 9, 2025,  08:26 PM</vote_date>
  <vote_question_text>On the Amendment S.Amdt. 3853 to S.Amdt. 3748 to S. 2296 (No short title on file)</vote_question_text>
  <vote_document_text>To reduce the bloated Pentagon budget by 10 percent and instead expand veteran dental care at the Department of Veterans Affairs.</vote_document_text>
  <vote_result_text>Amendment Rejected (10-88, 3/5 majority required)</vote_result_text>
  <question>On the Amendment</question>
  <vote_title>Sanders Amdt. No. 3853</vote_title>
  <vote_result>Amendment Rejected</vote_result>
  <document>
    <document_type>S.Amdt.</document_type>
    <document_number/>
    <document_name/>
    <document_title/>
    <document_short_title/>
  </document>
  <amendment>
    <amendment_number>S.Amdt. 3853</amendment_number>
    <amendment_to_amendment_number>S.Amdt. 3748</amendment_to_amendment_number>
    <amendment_to_document_number>S. 2296</amendment_to_document_number>
    <amendment_to_document_short_title>No short title on file</amendment_to_document_short_title>
    <amendment_purpose>To reduce the bloated Pentagon budget by 10 percent and instead expand veteran dental care at the Department of Veterans Affairs.</amendment_purpose>
  </amendment>
  <members>
    <member><lis_member_id>S366</lis_member_id><vote_cast>Yea</vote_cast></member>
  </members>
</roll_call_vote>`;

// Same shape, but the amendment document carries its own number — an
// "S.Amdt." is still not a bill type, so the document path must yield null.
const senateNumberedAmendmentXml = senateAmendmentXml.replace(
  "<document_number/>",
  "<document_number>3853</document_number>",
);

// Every text field the description chain prefers is empty or filler, so it
// falls through to vote_title.
const senateFillerXml = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress>119</congress>
  <session>1</session>
  <congress_year>2025</congress_year>
  <vote_number>481</vote_number>
  <vote_date>September 18, 2025,  02:11 PM</vote_date>
  <vote_document_text></vote_document_text>
  <vote_result_text>Amendment Agreed to (81-15)</vote_result_text>
  <question>On the Amendment</question>
  <vote_title>Mullin Amdt. No. 3412</vote_title>
  <vote_result>Amendment Agreed to</vote_result>
  <document>
    <document_type>S.Amdt.</document_type>
    <document_number/>
    <document_title/>
    <document_short_title/>
  </document>
  <amendment>
    <amendment_number>S.Amdt. 3412</amendment_number>
    <amendment_to_document_number>H.R. 3944</amendment_to_document_number>
    <amendment_to_document_short_title>No short title on file</amendment_to_document_short_title>
    <amendment_purpose>No Statement of Purpose on File.</amendment_purpose>
  </amendment>
  <members>
    <member><lis_member_id>S366</lis_member_id><vote_cast>Yea</vote_cast></member>
  </members>
</roll_call_vote>`;

// The same vote with no parent document either: nothing left to link to.
const senateFillerNoParentXml = senateFillerXml.replace(
  "<amendment_to_document_number>H.R. 3944</amendment_to_document_number>",
  "<amendment_to_document_number/>",
);

// clerk.house.gov/evs/2025/roll300.xml — a plain bill vote.
const houseBillXml = `<?xml version="1.0"?>
<rollcall-vote>
  <vote-metadata>
    <congress>119</congress>
    <session>1st</session>
    <chamber>U.S. House of Representatives</chamber>
    <rollcall-num>300</rollcall-num>
    <legis-num>H R 4058</legis-num>
    <vote-question>On Motion to Suspend the Rules and Pass</vote-question>
    <vote-type>2/3 YEA-AND-NAY</vote-type>
    <vote-result>Passed</vote-result>
    <action-date>19-Nov-2025</action-date>
    <vote-desc>Enhancing Stakeholder Support and Outreach for Preparedness Grants Act</vote-desc>
  </vote-metadata>
  <vote-data>
    <recorded-vote><legislator name-id="A000055">Aderholt</legislator><vote>Yea</vote></recorded-vote>
  </vote-data>
</rollcall-vote>`;

// clerk.house.gov/evs/2025/roll250.xml — vote-desc is empty on House
// amendment votes; amendment-author is the only description published.
const houseAmendmentXml = `<?xml version="1.0"?>
<rollcall-vote>
  <vote-metadata>
    <congress>119</congress>
    <session>1st</session>
    <committee>U.S. House of Representatives</committee>
    <rollcall-num>250</rollcall-num>
    <legis-num>H R 3838</legis-num>
    <vote-question>On Agreeing to the Amendment</vote-question>
    <amendment-num>2</amendment-num>
    <amendment-author>Smith of New Jersey Part A Amendment No. 7</amendment-author>
    <vote-type>RECORDED VOTE</vote-type>
    <vote-result>Failed</vote-result>
    <action-date>10-Sep-2025</action-date>
    <vote-desc></vote-desc>
  </vote-metadata>
  <vote-data>
    <recorded-vote><legislator name-id="A000055">Aderholt</legislator><vote>Aye</vote></recorded-vote>
  </vote-data>
</rollcall-vote>`;

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
      description: null,
      resultText: null,
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

  it("reads the bill's plain-English description from vote-desc", () => {
    expect(parseHouseVote(houseBillXml)).toMatchObject({
      id: "house-119-1-300",
      question: "On Motion to Suspend the Rules and Pass",
      description:
        "Enhancing Stakeholder Support and Outreach for Preparedness Grants Act",
      resultText: null,
      billId: "hr-4058-119",
    });
  });

  it("falls back to amendment-author when vote-desc is empty", () => {
    expect(parseHouseVote(houseAmendmentXml)).toMatchObject({
      id: "house-119-1-250",
      question: "On Agreeing to the Amendment",
      description: "Smith of New Jersey Part A Amendment No. 7",
      resultText: null,
      billId: "hr-3838-119",
    });
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
      description: null,
      resultText: null,
      billId: "s-1234-119",
    });
  });

  it("keys positions by LIS id and normalizes live pairs to present", () => {
    expect(parsed.positions).toEqual([
      { memberId: "S366", position: "yea" },
      { memberId: "S391", position: "present" },
    ]);
  });

  it("names the nominee on a confirmation vote", () => {
    expect(parseSenateVote(senateNominationXml)).toMatchObject({
      id: "senate-119-1-532",
      question: "On the Nomination",
      description:
        "Michael G. Waltz, of Florida, to be Representative of the United States of America to the Sessions of the General Assembly of the United Nations",
      resultText: "Nomination Confirmed (54-45)",
      billId: null,
    });
  });

  it("names the nominee on a cloture motion", () => {
    expect(parseSenateVote(senateClotureXml)).toMatchObject({
      id: "senate-119-1-300",
      question: "On the Cloture Motion",
      description:
        "Stephen Vaden, of Tennessee, to be Deputy Secretary of Agriculture",
      resultText: "Cloture Motion Agreed to (48-45)",
      billId: null,
    });
  });

  it("links an amendment to the bill it amends", () => {
    expect(parseSenateVote(senateAmendmentXml)).toMatchObject({
      id: "senate-119-1-568",
      question: "On the Amendment",
      description:
        "To reduce the bloated Pentagon budget by 10 percent and instead expand veteran dental care at the Department of Veterans Affairs.",
      resultText: "Amendment Rejected (10-88, 3/5 majority required)",
      billId: "s-2296-119",
    });
  });

  it("still reaches the amendment when the S.Amdt. document is numbered", () => {
    expect(parseSenateVote(senateNumberedAmendmentXml).billId).toBe(
      "s-2296-119",
    );
  });

  it("falls through filler text to vote_title", () => {
    expect(parseSenateVote(senateFillerXml)).toMatchObject({
      description: "Mullin Amdt. No. 3412",
      resultText: "Amendment Agreed to (81-15)",
      billId: "hr-3944-119",
    });
  });

  it("leaves billId null when no parent document is published", () => {
    const withoutParent = parseSenateVote(senateFillerNoParentXml);
    expect(withoutParent.billId).toBeNull();
    expect(withoutParent.description).toBe("Mullin Amdt. No. 3412");
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

describe("normalizeText", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeText("  On   the\n  Nomination ")).toBe(
      "On the Nomination",
    );
  });

  it("returns null for absent and empty values", () => {
    expect(normalizeText(undefined)).toBeNull();
    expect(normalizeText(null)).toBeNull();
    expect(normalizeText("")).toBeNull();
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText("undefined")).toBeNull();
  });

  it("returns null for the sources' filler phrases", () => {
    expect(normalizeText("No Statement of Purpose on File.")).toBeNull();
    expect(normalizeText("no statement of purpose")).toBeNull();
    expect(normalizeText("No short title on file")).toBeNull();
    expect(normalizeText("NO TITLE AVAILABLE.")).toBeNull();
  });

  it("keeps real text that merely mentions a filler word", () => {
    expect(normalizeText("A bill with no short title on file for review")).toBe(
      "A bill with no short title on file for review",
    );
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

// --- QA additions -----------------------------------------------------------
// The fixtures above prove the rungs the live feeds happen to exercise today.
// These build the minimal document that forces each remaining rung, so that a
// future reordering of a fallback chain fails here instead of in production.

// A Senate document with only the elements a case needs, so each assertion
// isolates one rung rather than relying on which fields a real vote carried.
function senateVoteXml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress>119</congress>
  <session>1</session>
  <congress_year>2025</congress_year>
  <vote_number>1</vote_number>
  <vote_date>June 10, 2025,  11:53 AM</vote_date>
  <question>On the Amendment</question>
  <vote_result>Agreed to</vote_result>
  ${inner}
  <members>
    <member><lis_member_id>S1</lis_member_id><vote_cast>Yea</vote_cast></member>
  </members>
</roll_call_vote>`;
}

function houseVoteXml(inner: string): string {
  return `<?xml version="1.0"?>
<rollcall-vote>
  <vote-metadata>
    <congress>119</congress>
    <session>1st</session>
    <rollcall-num>1</rollcall-num>
    <vote-question>On Passage</vote-question>
    <vote-result>Passed</vote-result>
    <action-date>10-Sep-2025</action-date>
    ${inner}
  </vote-metadata>
  <vote-data>
    <recorded-vote><legislator name-id="A000055">A</legislator><vote>Yea</vote></recorded-vote>
  </vote-data>
</rollcall-vote>`;
}

describe("senate description fallback chain", () => {
  it("prefers vote_document_text over every later rung", () => {
    expect(
      parseSenateVote(
        senateVoteXml(`
          <vote_document_text>First</vote_document_text>
          <document><document_title>Second</document_title></document>
          <amendment><amendment_purpose>Third</amendment_purpose></amendment>
          <vote_title>Fourth</vote_title>`),
      ).description,
    ).toBe("First");
  });

  it("falls to document_title when vote_document_text is filler, not merely absent", () => {
    expect(
      parseSenateVote(
        senateVoteXml(`
          <vote_document_text>No Title Available.</vote_document_text>
          <document><document_title>Second</document_title></document>
          <amendment><amendment_purpose>Third</amendment_purpose></amendment>
          <vote_title>Fourth</vote_title>`),
      ).description,
    ).toBe("Second");
  });

  it("falls to amendment_purpose when both earlier rungs are filler", () => {
    expect(
      parseSenateVote(
        senateVoteXml(`
          <vote_document_text/>
          <document><document_title>No short title on file</document_title></document>
          <amendment><amendment_purpose>Third</amendment_purpose></amendment>
          <vote_title>Fourth</vote_title>`),
      ).description,
    ).toBe("Third");
  });

  it("returns null rather than empty text when all four rungs are filler", () => {
    const parsed = parseSenateVote(
      senateVoteXml(`
        <vote_document_text/>
        <document><document_title/></document>
        <amendment><amendment_purpose>No Statement of Purpose on File.</amendment_purpose></amendment>
        <vote_title>   </vote_title>`),
    );
    expect(parsed.description).toBeNull();
  });

  it("decodes XML entities instead of storing the escapes", () => {
    expect(
      parseSenateVote(
        senateVoteXml(
          `<vote_document_text>Ways &amp; Means &quot;reform&quot;</vote_document_text>`,
        ),
      ).description,
    ).toBe('Ways & Means "reform"');
  });

  it("nulls resultText when vote_result_text is absent or empty", () => {
    expect(parseSenateVote(senateVoteXml("")).resultText).toBeNull();
    expect(
      parseSenateVote(senateVoteXml(`<vote_result_text/>`)).resultText,
    ).toBeNull();
  });
});

describe("senate billId precedence", () => {
  it("keeps the document-derived bill when the vote also names an amended bill", () => {
    expect(
      parseSenateVote(
        senateVoteXml(`
          <document><document_type>S.</document_type><document_number>1234</document_number></document>
          <amendment><amendment_to_document_number>H.R. 9999</amendment_to_document_number></amendment>`),
      ).billId,
    ).toBe("s-1234-119");
  });

  it("leaves billId null for an amendment to another amendment", () => {
    expect(
      parseSenateVote(
        senateVoteXml(
          `<amendment><amendment_to_document_number>S.Amdt. 3748</amendment_to_document_number></amendment>`,
        ),
      ).billId,
    ).toBeNull();
  });

  it("reaches the amendment path when the document element is absent entirely", () => {
    expect(
      parseSenateVote(
        senateVoteXml(
          `<amendment><amendment_to_document_number>H.Con.Res. 14</amendment_to_document_number></amendment>`,
        ),
      ).billId,
    ).toBe("hconres-14-119");
  });
});

describe("house description fallback chain", () => {
  it("falls to amendment-author when vote-desc is filler rather than empty", () => {
    expect(
      parseHouseVote(
        houseVoteXml(`
          <vote-desc>No Title Available</vote-desc>
          <amendment-author>Smith of New Jersey Amendment No. 7</amendment-author>`),
      ).description,
    ).toBe("Smith of New Jersey Amendment No. 7");
  });

  it("falls to amendment-author when vote-desc holds only whitespace", () => {
    expect(
      parseHouseVote(
        houseVoteXml(`
          <vote-desc>   </vote-desc>
          <amendment-author>Author</amendment-author>`),
      ).description,
    ).toBe("Author");
  });

  it("keeps resultText null even when the House publishes vote totals", () => {
    expect(
      parseHouseVote(
        houseVoteXml(`<vote-desc>A bill</vote-desc>`),
      ).resultText,
    ).toBeNull();
  });
});

describe("parsers never emit empty or 'undefined' text", () => {
  const cases = [
    parseSenateVote(senateVoteXml("")),
    parseSenateVote(
      senateVoteXml(`<vote_document_text/><vote_result_text/><vote_title/>`),
    ),
    parseHouseVote(houseVoteXml("")),
    parseHouseVote(houseVoteXml(`<vote-desc/><amendment-author/>`)),
  ];

  it("returns null, never '' or 'undefined', for description and resultText", () => {
    for (const parsed of cases) {
      expect(parsed.description === "" || parsed.description === "undefined").toBe(
        false,
      );
      expect(parsed.resultText === "" || parsed.resultText === "undefined").toBe(
        false,
      );
      expect(parsed.description).toBeNull();
      expect(parsed.resultText).toBeNull();
    }
  });
});

describe("normalizeText filler matching", () => {
  it("matches fillers regardless of case, surrounding space, or trailing period", () => {
    expect(normalizeText("  NO STATEMENT OF PURPOSE ON FILE.  ")).toBeNull();
    expect(normalizeText("No\nShort\tTitle On File")).toBeNull();
    expect(normalizeText("no title available.")).toBeNull();
  });

  it("does not strip a filler phrase that ends a real sentence", () => {
    expect(normalizeText("This measure has no short title on file")).toBe(
      "This measure has no short title on file",
    );
  });
});

describe("normalizeText on non-scalar parser output", () => {
  it("returns null rather than '[object Object]' for objects and arrays", () => {
    expect(normalizeText({ "#text": "Text", "@_type": "html" })).toBeNull();
    expect(normalizeText(["First", "Second"])).toBeNull();
  });

  it("falls through to the next source when the element carries an attribute", () => {
    expect(
      parseSenateVote(
        senateVoteXml(`
          <vote_document_text format="html">Attributed</vote_document_text>
          <document><document_title>Lucy Chen, of Ohio, to be an Ambassador</document_title></document>`),
      ).description,
    ).toBe("Lucy Chen, of Ohio, to be an Ambassador");
  });

  it("falls through to the next source when the element repeats", () => {
    expect(
      parseSenateVote(
        senateVoteXml(`
          <vote_document_text>First</vote_document_text>
          <vote_document_text>Second</vote_document_text>
          <document><document_title>Lucy Chen, of Ohio, to be an Ambassador</document_title></document>`),
      ).description,
    ).toBe("Lucy Chen, of Ohio, to be an Ambassador");
  });
});

// A widened type guard is easy to widen past the values it was meant to admit.
// fast-xml-parser hands back a number for any numeric element body, so numbers
// must survive the guard or a numeric description would vanish silently.
describe("normalizeText scalar pass-through", () => {
  it("still coerces numeric parser output to text", () => {
    expect(normalizeText(2026)).toBe("2026");
    expect(normalizeText(0)).toBe("0");
  });

  it("still returns null for absent values", () => {
    expect(normalizeText(null)).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
  });

  it("keeps a numeric element readable at the parser level", () => {
    expect(
      parseHouseVote(houseVoteXml(`<vote-desc>2026</vote-desc>`)).description,
    ).toBe("2026");
    expect(
      parseSenateVote(senateVoteXml(`<vote_result_text>2026</vote_result_text>`))
        .resultText,
    ).toBe("2026");
  });
});
