import { describe, expect, it } from "vitest";
import {
  billPhase,
  categoryForBillType,
  categoryForRollCall,
  leadTextFor,
  resultKind,
  votePhase,
} from "./legislation";

describe("categoryForBillType", () => {
  it("splits bills from resolutions", () => {
    expect(categoryForBillType("hr")).toBe("bill");
    expect(categoryForBillType("s")).toBe("bill");
    expect(categoryForBillType("hres")).toBe("resolution");
    expect(categoryForBillType("sjres")).toBe("resolution");
    expect(categoryForBillType("hconres")).toBe("resolution");
  });
});

describe("categoryForRollCall", () => {
  it("classifies an amendment vote as an amendment even when it is linked to a bill", () => {
    expect(
      categoryForRollCall({ question: "On the Amendment", billType: "s" }),
    ).toBe("amendment");
    expect(
      categoryForRollCall({
        question: "On Agreeing to the Amendment",
        billType: "hr",
      }),
    ).toBe("amendment");
    expect(
      categoryForRollCall({
        question: "On Agreeing to the Amendment, as Modified",
        billType: "hr",
      }),
    ).toBe("amendment");
  });

  it("classifies a bill-linked vote by its bill type", () => {
    expect(categoryForRollCall({ question: "On Passage", billType: "hr" })).toBe(
      "bill",
    );
    expect(
      categoryForRollCall({
        question: "On Passage of the Bill",
        billType: "sjres",
      }),
    ).toBe("resolution");
  });

  it("classifies nominations from the question", () => {
    expect(
      categoryForRollCall({ question: "On the Nomination", billType: null }),
    ).toBe("nomination");
  });

  it("keeps a bill-linked procedural vote with its bill", () => {
    expect(
      categoryForRollCall({ question: "On the Cloture Motion", billType: null }),
    ).toBe("motion");
    expect(
      categoryForRollCall({ question: "On the Cloture Motion", billType: "s" }),
    ).toBe("bill");
    expect(
      categoryForRollCall({ question: "On the Motion to Table", billType: null }),
    ).toBe("motion");
  });

  it("excludes motions to concur in a Senate amendment", () => {
    expect(
      categoryForRollCall({
        question: "On Motion to Concur in the Senate Amendment",
        billType: "hr",
      }),
    ).toBe("bill");
  });

  it("falls back to motion with no bill and no keyword", () => {
    expect(
      categoryForRollCall({
        question: "Election of the Speaker",
        billType: null,
      }),
    ).toBe("motion");
  });
});

describe("leadTextFor", () => {
  const amendment = {
    question: "On the Amendment",
    billType: "hr" as string | null,
    billTitle: "Energy and Water Development Appropriations Act, 2026",
    description: "To strike the appropriations for the Office of Management and Budget.",
  };

  it("leads an amendment vote with the amendment's own description", () => {
    expect(leadTextFor(amendment)).toBe(
      "To strike the appropriations for the Office of Management and Budget.",
    );
  });

  it("falls back to the bill title when the amendment has no description", () => {
    expect(leadTextFor({ ...amendment, description: null })).toBe(
      "Energy and Water Development Appropriations Act, 2026",
    );
  });

  it("falls back to the question when an amendment has neither", () => {
    expect(
      leadTextFor({ ...amendment, billTitle: null, description: null }),
    ).toBe("On the Amendment");
  });

  it("leads a bill vote with the bill title, not the description", () => {
    expect(
      leadTextFor({
        question: "On Passage of the Bill",
        billType: "s",
        billTitle: "A bill making continuing appropriations.",
        description: "Motion to pass the continuing resolution.",
      }),
    ).toBe("A bill making continuing appropriations.");
  });

  it("leads a bill-less nomination with its description", () => {
    expect(
      leadTextFor({
        question: "On the Nomination",
        billType: null,
        billTitle: null,
        description: "Confirmation of Jane Doe to be a District Judge.",
      }),
    ).toBe("Confirmation of Jane Doe to be a District Judge.");
  });

  // The /votes/[id] parent-bill context line decides whether to render by
  // comparing this return value with billTitle, so the identity has to hold: it
  // equals billTitle exactly when the amendment's own text did not lead.
  it("returns the bill title itself only when the amendment's text did not lead", () => {
    expect(leadTextFor(amendment)).not.toBe(amendment.billTitle);
    expect(leadTextFor({ ...amendment, description: null })).toBe(
      amendment.billTitle,
    );
  });
});

describe("billPhase", () => {
  it("flags enacted laws from the status text", () => {
    expect(
      billPhase({ status: "Became Public Law No: 119-74.", rollCalls: [] }),
    ).toEqual({ label: "Became law", kind: "law" });
  });

  it("detects single-chamber passage", () => {
    expect(
      billPhase({
        status: null,
        rollCalls: [
          { chamber: "house", result: "Passed", question: "On Passage" },
        ],
      }),
    ).toEqual({ label: "Passed House", kind: "passed" });
  });

  it("detects passage in both chambers", () => {
    expect(
      billPhase({
        status: "Message on Senate action sent to the House.",
        rollCalls: [
          { chamber: "house", result: "Passed", question: "On Passage" },
          {
            chamber: "senate",
            result: "Agreed to",
            question: "On Agreeing to the Resolution",
          },
        ],
      }).label,
    ).toBe("Passed both chambers");
  });

  it("calls a bill with only a failed passage vote Failed", () => {
    expect(
      billPhase({
        status: "On motion to suspend the rules and pass the bill Failed",
        rollCalls: [
          {
            chamber: "house",
            result: "Failed",
            question: "On motion to suspend the rules and pass",
          },
        ],
      }),
    ).toEqual({ label: "Failed", kind: "failed" });
  });

  it("marks procedural-only progress as Advanced", () => {
    expect(
      billPhase({
        status: null,
        rollCalls: [
          {
            chamber: "senate",
            result: "Agreed to",
            question: "On the Motion to Proceed",
          },
        ],
      }),
    ).toEqual({ label: "Advanced", kind: "progress" });
  });
});

describe("votePhase", () => {
  it("maps result text to a phase", () => {
    expect(votePhase("Confirmed")).toEqual({
      label: "Confirmed",
      kind: "passed",
    });
    expect(votePhase("Agreed to")).toEqual({ label: "Passed", kind: "passed" });
    expect(votePhase("Rejected")).toEqual({ label: "Failed", kind: "failed" });
  });

  it("reads a defeat as a failure and leaves anything else as-is", () => {
    expect(votePhase("Bill Defeated")).toEqual({
      label: "Failed",
      kind: "failed",
    });
    expect(votePhase("Point of Order Sustained")).toEqual({
      label: "Point of Order Sustained",
      kind: "progress",
    });
  });
});

describe("resultKind", () => {
  it("reads confirmations and passages as passed", () => {
    expect(resultKind("Nomination Confirmed")).toBe("passed");
    expect(resultKind("Cloture Motion Agreed to")).toBe("passed");
    expect(resultKind("Passed")).toBe("passed");
  });

  it("reads defeats as failed", () => {
    expect(resultKind("Bill Defeated")).toBe("failed");
    expect(resultKind("Joint Resolution Defeated")).toBe("failed");
    expect(resultKind("Amendment Rejected")).toBe("failed");
    expect(resultKind("Motion to Table Failed")).toBe("failed");
  });

  it("reads results that are neither as other", () => {
    expect(resultKind("Point of Order Sustained")).toBe("other");
    expect(resultKind("Decision of Chair Not Sustained")).toBe("other");
    expect(resultKind("Johnson (LA)")).toBe("other");
  });
});

// --- QA additions: contract edges the slice-2 criteria state but did not pin ---

describe("categoryForRollCall — precedence and exclusions", () => {
  it("evaluates nomination before amendment", () => {
    // Criterion A fixes the order; a question carrying both keywords must
    // resolve to nomination, so reordering the two branches is caught.
    expect(
      categoryForRollCall({
        question: "On the Nomination, as amended by the Amendment",
        billType: null,
      }),
    ).toBe("nomination");
  });

  it("keeps the suspension form of a concur motion with its bill", () => {
    // house-119-2-286 in the live data.
    expect(
      categoryForRollCall({
        question: "On Motion to Suspend the Rules and Concur in the Senate Amendments",
        billType: "hr",
      }),
    ).toBe("bill");
  });

  it("keeps a concur motion on a concurrent resolution with its resolution", () => {
    // house-119-1-100: bill_type hconres, so the concur exclusion must land on
    // "resolution", not on "amendment" and not on "bill".
    expect(
      categoryForRollCall({
        question: "On Motion to Concur in the Senate Amendment",
        billType: "hconres",
      }),
    ).toBe("resolution");
  });

  it("does not let the concur exclusion hijack a plain concurrent resolution", () => {
    // /concur/i also matches "Concurrent"; with no amendment keyword the
    // exclusion must never be reached at all.
    expect(
      categoryForRollCall({
        question: "On the Concurrent Resolution",
        billType: "sconres",
      }),
    ).toBe("resolution");
    expect(
      categoryForRollCall({
        question: "On the Concurrent Resolution",
        billType: null,
      }),
    ).toBe("motion");
  });

  it("classifies an amendment vote that is not linked to a bill", () => {
    expect(
      categoryForRollCall({ question: "On the Amendment", billType: null }),
    ).toBe("amendment");
  });
});

describe("resultKind — predicate order", () => {
  it("reads a negated passage as a failure", () => {
    // "Not Agreed to" contains "agreed"; the failure predicate must win.
    expect(resultKind("Not Agreed to")).toBe("failed");
    expect(resultKind("Cloture on the Motion to Proceed Rejected")).toBe(
      "failed",
    );
    expect(resultKind("Motion to Proceed Rejected")).toBe("failed");
  });

  it("reads an adoption as passed", () => {
    expect(resultKind("Adopted")).toBe("passed");
  });

  it("reads a ruling of the chair as neither", () => {
    expect(resultKind("Decision of Chair Sustained")).toBe("other");
    expect(resultKind("Point of Order Well Taken")).toBe("other");
  });
});

describe("votePhase — labels", () => {
  it("keeps the raw result as the label for a Speaker election", () => {
    expect(votePhase("Johnson (LA)")).toEqual({
      label: "Johnson (LA)",
      kind: "progress",
    });
  });

  it("labels a confirmation Confirmed and any other passage Passed", () => {
    expect(votePhase("Nomination Confirmed")).toEqual({
      label: "Confirmed",
      kind: "passed",
    });
    expect(votePhase("Bill Passed")).toEqual({
      label: "Passed",
      kind: "passed",
    });
  });
});

describe("billPhase is not affected by resultKind gaining 'defeated'", () => {
  it("still calls a defeated passage vote Failed, not Advanced", () => {
    expect(resultKind("Bill Defeated")).toBe("failed");
    expect(
      billPhase({
        status: null,
        rollCalls: [
          {
            chamber: "senate",
            result: "Bill Defeated",
            question: "On Passage of the Bill",
          },
        ],
      }),
    ).toEqual({ label: "Failed", kind: "failed" });
  });

  it("still reads a motion to concur as a passage question", () => {
    expect(
      billPhase({
        status: null,
        rollCalls: [
          {
            chamber: "house",
            result: "Passed",
            question: "On Motion to Concur in the Senate Amendment",
          },
        ],
      }),
    ).toEqual({ label: "Passed House", kind: "passed" });
  });
});

describe("leadTextFor — non-amendment votes keep the slice-1 chain", () => {
  it("leads a motion to concur with the bill title, not the description", () => {
    expect(
      leadTextFor({
        question: "On Motion to Concur in the Senate Amendment",
        billType: "hr",
        billTitle: "One Big Beautiful Bill Act",
        description: "A roll-call description that must not win",
      }),
    ).toBe("One Big Beautiful Bill Act");
  });

  it("falls back to the question when a non-amendment vote has neither", () => {
    expect(
      leadTextFor({
        question: "Election of the Speaker",
        billType: null,
        billTitle: null,
        description: null,
      }),
    ).toBe("Election of the Speaker");
  });

  it("leads a bill-less amendment vote with its description", () => {
    expect(
      leadTextFor({
        question: "On the Amendment",
        billType: null,
        billTitle: null,
        description: "To strike section 3.",
      }),
    ).toBe("To strike section 3.");
  });
});
