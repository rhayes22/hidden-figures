// Classification + phase logic for the "what Congress voted on" browser.

export type Category =
  | "bill"
  | "resolution"
  | "nomination"
  | "motion"
  | "amendment";

export const CATEGORIES: Category[] = [
  "bill",
  "resolution",
  "nomination",
  "motion",
  "amendment",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  bill: "Bill",
  resolution: "Resolution",
  nomination: "Nomination",
  motion: "Motion",
  amendment: "Amendment",
};

// Classifies a *bill*, not a roll call — the grouped per-bill card on /bills.
export function categoryForBillType(billType: string): Category {
  return billType === "hr" || billType === "s" ? "bill" : "resolution";
}

// The single precedence rule for a roll call. A vote on an amendment is an
// amendment vote even when it is linked to its parent bill, which every
// amendment vote is. "Motion to Concur in the Senate Amendment" disposes of the
// bill itself, so it stays with the bill.
export function categoryForRollCall(input: {
  question: string;
  billType: string | null;
}): Category {
  if (/nomination/i.test(input.question)) return "nomination";
  if (/amendment/i.test(input.question) && !/concur/i.test(input.question)) {
    return "amendment";
  }
  if (input.billType != null) return categoryForBillType(input.billType);
  return "motion"; // cloture, motion to proceed/table/commit, quorum, etc.
}

// The lead text a roll call is headlined with. An amendment vote leads with the
// amendment's own description; everything else leads with the bill title.
export function leadTextFor(input: {
  question: string;
  billType: string | null;
  billTitle: string | null;
  description: string | null;
}): string {
  if (categoryForRollCall(input) === "amendment") {
    return input.description ?? input.billTitle ?? input.question;
  }
  return input.billTitle ?? input.description ?? input.question;
}

export type PhaseKind = "law" | "passed" | "failed" | "progress";

export type Phase = { label: string; kind: PhaseKind };

const PASSED = /pass|agreed|confirm/i;
const PASSAGE_Q = /passage|agreeing|suspend the rules and pass|concur/i;
const CONFIRMED = /confirm/i;
const RESULT_FAILED = /reject|fail|not agreed|negatived|defeated/i;
const RESULT_PASSED = /pass|agreed|adopt/i;

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

export type ResultKind = "passed" | "failed" | "other";

// The single reading of a roll call's result text. Some results — a Speaker
// election, points of order, rulings of the chair — are neither.
export function resultKind(result: string): ResultKind {
  if (CONFIRMED.test(result)) return "passed";
  if (RESULT_FAILED.test(result)) return "failed";
  if (RESULT_PASSED.test(result)) return "passed";
  return "other";
}

// Phase for a standalone vote (nomination / motion / amendment) from its result.
export function votePhase(result: string): Phase {
  const kind = resultKind(result);
  if (kind === "passed") {
    return CONFIRMED.test(result)
      ? { label: "Confirmed", kind: "passed" }
      : { label: "Passed", kind: "passed" };
  }
  if (kind === "failed") return { label: "Failed", kind: "failed" };
  return { label: result, kind: "progress" };
}

export function phaseBadgeClass(kind: PhaseKind): string {
  if (kind === "law") return "bg-amber-100 text-amber-800 ring-1 ring-amber-300";
  if (kind === "passed") return "bg-green-50 text-green-800";
  if (kind === "failed") return "bg-flag-red-soft text-flag-red";
  return "bg-gray-100 text-gray-600";
}
