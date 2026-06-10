import { describe, expect, it } from "vitest";
import {
  billPhase,
  categoryForBillType,
  categoryForQuestion,
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

describe("categoryForQuestion", () => {
  it("classifies bill-less votes", () => {
    expect(categoryForQuestion("On the Nomination")).toBe("nomination");
    expect(categoryForQuestion("On the Amendment")).toBe("amendment");
    expect(categoryForQuestion("On the Cloture Motion")).toBe("motion");
    expect(categoryForQuestion("On the Motion to Table")).toBe("motion");
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
});
