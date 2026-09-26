import { describe, expect, it } from "vitest";
import {
  selectSummary,
  summaryTextFor,
  summaryToText,
  type ApiSummary,
} from "./bill-summary";

function summary(fields: Partial<ApiSummary>): ApiSummary {
  return {
    actionDate: "2025-01-01",
    actionDesc: "Introduced in House",
    updateDate: "2025-01-02T00:00:00Z",
    versionCode: "00",
    text: "<p>A summary.</p>",
    ...fields,
  };
}

// The five summaries api.congress.gov returns for hr-1-119, measured
// 2026-09-25. Two share an actionDate; versionCode runs 00, 07, 53, 55, 49.
const HR1: ApiSummary[] = [
  summary({ actionDate: "2025-05-20", updateDate: "2025-05-22T17:15:29Z", versionCode: "00", actionDesc: "Introduced in House" }),
  summary({ actionDate: "2025-05-20", updateDate: "2025-09-22T12:34:08Z", versionCode: "07", actionDesc: "Reported to House" }),
  summary({ actionDate: "2025-05-22", updateDate: "2025-06-16T13:42:01Z", versionCode: "53", actionDesc: "Passed House" }),
  summary({ actionDate: "2025-07-01", updateDate: "2025-10-06T21:56:04Z", versionCode: "55", actionDesc: "Passed Senate" }),
  summary({ actionDate: "2025-07-04", updateDate: "2025-10-06T21:40:39Z", versionCode: "49", actionDesc: "Public Law" }),
];

describe("selectSummary", () => {
  it("returns null for an empty array", () => {
    expect(selectSummary([])).toBeNull();
  });

  it("returns the only element when there is one", () => {
    const only = summary({ actionDesc: "Introduced in House" });
    expect(selectSummary([only])).toBe(only);
  });

  it("takes the greatest actionDate regardless of input order", () => {
    expect(selectSummary(HR1)?.actionDesc).toBe("Public Law");
    expect(selectSummary([...HR1].reverse())?.actionDesc).toBe("Public Law");
  });

  it("does not sort on versionCode — Public Law 49 beats Passed Senate 55", () => {
    const passedSenate = HR1[3];
    const publicLaw = HR1[4];
    expect(passedSenate.versionCode > publicLaw.versionCode).toBe(true);
    expect(selectSummary([passedSenate, publicLaw])).toBe(publicLaw);
    expect(selectSummary([publicLaw, passedSenate])).toBe(publicLaw);
  });

  it("breaks an actionDate tie on the greater updateDate", () => {
    const introduced = HR1[0];
    const reported = HR1[1];
    expect(introduced.actionDate).toBe(reported.actionDate);
    expect(selectSummary([introduced, reported])).toBe(reported);
    expect(selectSummary([reported, introduced])).toBe(reported);
  });

  it("does not mutate or reorder its input", () => {
    const input = [...HR1];
    selectSummary(input);
    expect(input).toEqual(HR1);
  });
});

describe("summaryToText", () => {
  it("returns an empty string for empty input", () => {
    expect(summaryToText("")).toBe("");
  });

  it("separates paragraphs with a blank line", () => {
    expect(summaryToText("<p>One.</p><p>Two.</p>")).toBe("One.\n\nTwo.");
  });

  it("breaks on <br>, <br/> and </li>, and bullets list items", () => {
    expect(summaryToText("<p>A<br>B<br/>C</p>")).toBe("A\nB\nC");
    expect(summaryToText("<ul><li>One,</li><li>Two.</li></ul>")).toBe(
      "• One,\n• Two.",
    );
  });

  it("decodes the two measured entities", () => {
    expect(summaryToText("<p>Funds Act&nbsp;or the PROOF Act</p>")).toBe(
      "Funds Act or the PROOF Act",
    );
    expect(summaryToText("<p>Ways &amp; Means</p>")).toBe("Ways & Means");
  });

  it("collapses runs of spaces and three-or-more newlines, and trims", () => {
    expect(summaryToText("<p>  a   b  </p>")).toBe("a b");
    expect(summaryToText("<p>One.</p><br><br><p>Two.</p>")).toBe("One.\n\nTwo.");
  });

  // The list-run-on bug: converting only on </p> merges the last <li> into the
  // paragraph that follows it. Measured on hr-10326-119, where a naive
  // converter produces "…vulnerable to fraud.A federal agency may only use…".
  it("breaks between a closing list and the next paragraph", () => {
    const html =
      "<p>Programs covered by this requirement include:</p><ul>" +
      "<li>Medicaid,</li>" +
      "<li>any other program&nbsp;to which funds are made available to states and identified by DOJ as vulnerable to fraud.</li>" +
      "</ul><p>A federal agency may only use such information for law enforcement purposes.</p>";
    const text = summaryToText(html);
    expect(text).not.toContain("fraud.A federal agency");
    expect(text).toContain("fraud.\n\nA federal agency");
    expect(text).toContain("• Medicaid,");
  });

  // The mirror of the same bug on the leading side. CRS does not always close
  // the introducing sentence's <p> before opening the list, and only </ul>
  // emitted a break — so the first bullet landed on the end of that sentence,
  // "…include:• Medicaid". Latent rather than live: a query for '\\S•' over
  // the 456 stored summaries returned zero rows on 2026-09-26.
  it("breaks between an introducing sentence and an opening list", () => {
    const text = summaryToText(
      "<p>Programs covered include:<ul><li>Medicaid,</li><li>SNAP.</li></ul></p>",
    );
    expect(text).not.toContain("include:•");
    expect(text).toBe("Programs covered include:\n• Medicaid,\n• SNAP.");
  });

  it("handles the full measured tag vocabulary without leaking markup", () => {
    const html =
      "<p><strong>PROOF Act</strong></p>" +
      "<p>See <a href=\"https://www.congress.gov/crs-product/IF13134\">CRS In Focus 13134</a> " +
      "for <em>context</em>, <b>detail</b>, <i>caveats</i> and CO<sub>2</sub>.<br/>Next line.</p>" +
      "<ul><li>One</li></ul>";
    const text = summaryToText(html);
    expect(text).not.toMatch(/<[a-zA-Z]/);
    expect(text).not.toContain("href");
    expect(text).not.toContain("congress.gov");
    expect(text).toContain("CRS In Focus 13134");
    expect(text).toContain("PROOF Act");
    expect(text).toContain("context");
    expect(text).toContain("CO2");
    expect(text).toContain("detail");
    expect(text).toContain("caveats");
    expect(text).toContain("\nNext line.");
    expect(text).toContain("• One");
  });
});

describe("summaryTextFor", () => {
  it("returns null for no summaries", () => {
    expect(summaryTextFor([])).toBeNull();
  });

  it("returns null — not an empty string — when the text strips to whitespace", () => {
    expect(summaryTextFor([summary({ text: "<p> </p><ul></ul>" })])).toBeNull();
  });

  it("converts the selected version, not the first one", () => {
    const picked = summaryTextFor([
      summary({ actionDate: "2025-05-20", text: "<p>As introduced.</p>" }),
      summary({ actionDate: "2025-07-04", text: "<p>As enacted.</p>" }),
    ]);
    expect(picked).toBe("As enacted.");
  });
});

// --- QA additions ----------------------------------------------------------
// Properties the criteria depend on that the cases above do not pin. The
// stored column is only checkable after a backfill has already run; these
// assert the same guarantees where a failure is cheap.

describe("selectSummary is independent of the order the API returns", () => {
  // The five hr-1-119 versions permuted. The pick must be Public Law in every
  // ordering, or the stored summary would depend on response ordering rather
  // than on actionDate.
  it("picks Public Law from every rotation and from a sorted-descending array", () => {
    for (let offset = 0; offset < HR1.length; offset++) {
      const rotated = [...HR1.slice(offset), ...HR1.slice(0, offset)];
      expect(selectSummary(rotated)?.actionDesc).toBe("Public Law");
    }
    const descending = [...HR1].sort((a, b) =>
      b.actionDate.localeCompare(a.actionDate),
    );
    expect(selectSummary(descending)?.actionDesc).toBe("Public Law");
    const byVersionCode = [...HR1].sort((a, b) =>
      b.versionCode.localeCompare(a.versionCode),
    );
    expect(selectSummary(byVersionCode)?.actionDesc).toBe("Public Law");
  });
});

describe("summaryToText leaves no markup and loses no list break", () => {
  // Criterion D asserts "no stored summary contains < followed by a letter".
  // That query can only run after a write; this pins it at the unit level over
  // the full measured vocabulary, an href carrying a query string, and the
  // entity pair.
  const VOCABULARY =
    "<p><strong>Popular Name Act</strong></p>" +
    "<p>The bill amends <em>title 5</em> and <b>title 10</b>, see " +
    '<a href="https://www.congress.gov/crs-product/IF13134?a=1&amp;b=2">CRS In Focus 13134</a>' +
    ", limiting CO<sub>2</sub> and <i>related</i> emissions.<br/>" +
    "Ways &amp; Means reports&nbsp;annually. It also applies to:</p>" +
    "<ul><li>state agencies,</li><li>tribal governments.</li></ul>" +
    "<p>A federal agency may only use such information for law enforcement.</p>";

  it("produces no angle bracket followed by a letter and no href", () => {
    const text = summaryToText(VOCABULARY);
    expect(text).not.toMatch(/<[a-zA-Z]/);
    expect(text).not.toContain("href");
    expect(text).not.toContain("congress.gov");
    expect(text).not.toMatch(/&[a-zA-Z]+;/);
  });

  it("keeps every bullet at the start of its own line", () => {
    const text = summaryToText(VOCABULARY);
    const bulletAt = [...text.matchAll(/•/g)].map((m) => m.index ?? 0);
    expect(bulletAt.length).toBe(2);
    for (const index of bulletAt) {
      expect(index === 0 || text[index - 1] === "\n").toBe(true);
    }
  });

  it("breaks after </ul> for a trailing paragraph and between adjacent lists", () => {
    expect(summaryToText("<ul><li>A</li></ul><p>Next.</p>")).toBe("• A\n\nNext.");
    expect(
      summaryToText("<ul><li>A</li></ul><ul><li>B</li></ul>"),
    ).toBe("• A\n\n• B");
  });
});
