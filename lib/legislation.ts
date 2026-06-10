// Classification + phase logic for the "what Congress voted on" browser.

export type Category =
  | "bill"
  | "resolution"
  | "nomination"
  | "motion"
  | "amendment";

export const CATEGORY_LABEL: Record<Category, string> = {
  bill: "Bill",
  resolution: "Resolution",
  nomination: "Nomination",
  motion: "Motion",
  amendment: "Amendment",
};

export function categoryForBillType(billType: string): Category {
  return billType === "hr" || billType === "s" ? "bill" : "resolution";
}

// Bill-less roll calls: classify by the vote question.
export function categoryForQuestion(question: string): Category {
  const q = question.toLowerCase();
  if (q.includes("nomination")) return "nomination";
  if (q.includes("amendment")) return "amendment";
  return "motion"; // cloture, motion to proceed/table/commit, quorum, etc.
}

export type PhaseKind = "law" | "passed" | "failed" | "progress";

export type Phase = { label: string; kind: PhaseKind };

const PASSED = /pass|agreed|confirm/i;
const FAILED = /reject|fail|not agreed|negatived/i;
const PASSAGE_Q = /passage|agreeing|suspend the rules and pass|concur/i;

// Phase for a bill, from its roll calls + the latest-action status text.
export function billPhase(input: {
  status: string | null;
  rollCalls: Array<{ chamber: string; result: string; question: string }>;
}): Phase {
  if (input.status && /became\s+(public\s+)?law|public law/i.test(input.status)) {
    return { label: "Became law", kind: "law" };
  }
  const passedIn = (chamber: string) =>
    input.rollCalls.some(
      (rc) =>
        rc.chamber === chamber &&
        PASSED.test(rc.result) &&
        PASSAGE_Q.test(rc.question),
    );
  const house = passedIn("house");
  const senate = passedIn("senate");
  if (house && senate) return { label: "Passed both chambers", kind: "passed" };
  if (house) return { label: "Passed House", kind: "passed" };
  if (senate) return { label: "Passed Senate", kind: "passed" };
  if (input.rollCalls.some((rc) => PASSED.test(rc.result))) {
    return { label: "Advanced", kind: "progress" };
  }
  return { label: "Failed", kind: "failed" };
}

// Phase for a standalone vote (nomination / motion / amendment) from its result.
export function votePhase(result: string): Phase {
  if (/confirm/i.test(result)) return { label: "Confirmed", kind: "passed" };
  if (FAILED.test(result)) return { label: "Failed", kind: "failed" };
  if (PASSED.test(result)) return { label: "Passed", kind: "passed" };
  return { label: result, kind: "progress" };
}

export function phaseBadgeClass(kind: PhaseKind): string {
  if (kind === "law") return "bg-amber-100 text-amber-800 ring-1 ring-amber-300";
  if (kind === "passed") return "bg-green-50 text-green-800";
  if (kind === "failed") return "bg-flag-red-soft text-flag-red";
  return "bg-gray-100 text-gray-600";
}
