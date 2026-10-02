import { describe, it, expect } from "vitest";
import { ageDays, buildChains, DORMANT_DAYS } from "@/app/(sales)/_lib/report/chains";
import { periodMonths } from "@/app/(sales)/_lib/report/period";
import { cust, fact, makeD, sku } from "./_d";

// Pulled 2026-09-27 (epoch day 1000). 2026-06-29 is exactly 90 days earlier.
function chainD() {
  return makeD({
    cust: [
      cust("ויוינו נמל", "ויוינו", "2026-09-20", "HoReCa"), // 0
      cust("ויוינו חיפה", "ויוינו", "2026-06-28"), // 1: 91 days, dormant
      cust("ויוינו שרונה", "ויוינו", "2026-06-29"), // 2: 90 days, not dormant
      cust("ביסקוטי הרצליה", "ביסקוטי", "2025-11-28"), // 3
      cust("ביסקוטי רעננה", "ביסקוטי", "2025-11-16"), // 4
      cust("בבקה בייקרי (ישן)", "בבקה", "2026-02-17"), // 5: the old operating company
      cust("בבקה נטו (חדש)", "בבקה", "2026-09-24"), // 6: the new one, same branch
      cust("בבקה נמל", "בבקה", "2026-09-23"), // 7
      cust("אלי אברהמי הפצה", "אלי אברהמי", "2026-09-22"), // 8
      cust("יונימרקט מרכז", "יונימרקט", "2026-09-14"), // 9
      cust("קינג קונג כרמיאל", "קינג קונג", "2025-11-09"), // 10
      cust("מסעדה פרטית", "", "2026-09-10"), // 11: no chain
      cust("אפס פעולה", "אפס", ""), // 12: never ordered
    ],
    sku: [sku("S1", "תה פריש", "FRESH"), sku("S2", "תה דיטוקס", "DETOX"), sku("S3", "מארז טעימות", "מארזים")],
    rows: [
      fact(24, 0, 0, 10, 100_000),
      fact(23, 0, 1, 5, 50_000),
      fact(16, 1, 0, 3, 30_000),
      fact(20, 2, 0, 2, 20_000),
      fact(16, 3, 0, 4, 40_000),
      fact(17, 4, 0, 1, 10_000),
      fact(18, 5, 0, 1, 7_000),
      fact(22, 6, 0, 5, 50_000),
      fact(24, 6, 1, 1, 5_000),
      fact(23, 7, 0, 2, 12_000),
      fact(24, 8, 2, 3, 300_000),
      fact(22, 9, 0, 9, 200_000),
      fact(16, 10, 0, 1, 15_000),
      fact(24, 11, 0, 20, 500_000),
    ],
    chainMeta: {
      "ויוינו": { segment: "HoReCa", kind: "רשת" },
      "בבקה": { segment: "HoReCa", kind: "רשת", merge: { "בבקה בייקרי (ישן)": "בבקה כיכר הבימה", "בבקה נטו (חדש)": "בבקה כיכר הבימה" } },
      "אלי אברהמי": { segment: "מפיץ", kind: "מפיץ", rosterBadge: "מפיץ · לנדוור" },
      "יונימרקט": { segment: "קמעונאות", kind: "רשת", rosterBadge: "מרלו״ג" },
      "קינג קונג": { segment: "HoReCa", kind: "רשת", status: "moved_to_distributor", movedTo: "יונימרקט", movedOn: "2026-01", group: "לה טאבל" },
    },
  });
}
const D = chainD();
const MS = periodMonths(D.months, "2026");
const byName = (c: ReturnType<typeof buildChains>, n: string) => c.chains.find((x) => x.name === n)!;

describe("branch age", () => {
  it("counts whole days from the last order to the pull date", () => {
    expect(DORMANT_DAYS).toBe(90);
    expect(ageDays(D, "2026-06-29")).toBe(90);
    expect(ageDays(D, "2026-06-28")).toBe(91);
    expect(ageDays(D, "2026-09-27")).toBe(0);
    expect(ageDays(D, "")).toBeNull();
  });
});

describe("chains roster", () => {
  const c = buildChains(D, MS, "rev");

  it("takes the roster from the customer dimension, so a branch with no sales still shows", () => {
    expect(c.chains.map((x) => x.name)).toEqual(["אלי אברהמי", "ויוינו", "יונימרקט", "בבקה", "ביסקוטי", "קינג קונג", "אפס"]);
    expect(byName(c, "אפס").tot).toBe(0);
    expect(byName(c, "אפס").branches).toHaveLength(1);
    // the same roster in a window where nothing sold
    const quiet = buildChains(D, periodMonths(D.months, "2025"), "rev");
    expect(quiet.chains).toHaveLength(7);
    expect(quiet.kpi.branchCount).toBe(11);
  });

  it("sorts chains by revenue and a chain's branches by revenue", () => {
    expect(byName(c, "ויוינו").tot).toBe(200_000);
    expect(byName(c, "ויוינו").branches.map((b) => [b.name, b.tot])).toEqual([
      ["ויוינו נמל", 150_000],
      ["ויוינו חיפה", 30_000],
      ["ויוינו שרונה", 20_000],
    ]);
  });

  it("lists a branch's products with sales in the window, biggest first", () => {
    const nemal = byName(c, "ויוינו").branches[0];
    expect(nemal.products.map((p) => [p.si, p.tot])).toEqual([[0, 100_000], [1, 50_000]]);
  });

  it("calls a branch dormant after 90 days, and one that never ordered counts as dormant too", () => {
    const v = byName(c, "ויוינו");
    expect(v.branches.map((b) => [b.name, b.age, b.isDormant])).toEqual([
      ["ויוינו נמל", 7, false],
      ["ויוינו חיפה", 91, true],
      ["ויוינו שרונה", 90, false],
    ]);
    expect(v.dormant.map((b) => b.name)).toEqual(["ויוינו חיפה"]);
    const zero = byName(c, "אפס").branches[0];
    expect(zero.age).toBeNull();
    expect(zero.isDormant).toBe(false); // no "quiet N days" badge without a date...
    expect(byName(c, "אפס").dormant).toHaveLength(1); // ...but it is counted as quiet
  });

  it("shows two customer records of one branch as one branch, with their history joined", () => {
    const b = byName(c, "בבקה");
    expect(b.branches).toHaveLength(2);
    const merged = b.branches[0];
    expect(merged.name).toBe("בבקה כיכר הבימה");
    expect(merged.merged).toBe(2);
    expect(merged.tot).toBe(7_000 + 50_000 + 5_000);
    expect(merged.last).toBe("2026-09-24"); // the later record's last order
    expect(merged.age).toBe(3);
    expect(merged.products.map((p) => [p.si, p.tot])).toEqual([[0, 57_000], [1, 5_000]]);
    expect(b.tot).toBe(74_000);
  });

  it("badges: branch count, quiet branches, distributor, roster text, group, and a move", () => {
    const badges = (n: string) => byName(c, n).badges.map((x) => [x.kind, x.text]);
    expect(badges("ויוינו")).toEqual([["br", "3 סניפים"], ["sl", "אחד ישן"]]);
    expect(badges("ביסקוטי")).toEqual([["br", "2 סניפים"], ["sl", "2 ישנים"]]);
    expect(badges("בבקה")).toEqual([["br", "2 סניפים"]]);
    expect(badges("אלי אברהמי")).toEqual([["di", "מפיץ · לנדוור"]]);
    expect(badges("יונימרקט")).toEqual([["br", "מרלו״ג"]]);
    expect(badges("קינג קונג")).toEqual([
      ["br", "סניף אחד"],
      ["sl", "אחד ישן"],
      ["gr", "קבוצת לה טאבל"],
      ["mv", "עברה ליונימרקט · ינו׳ 26"],
    ]);
  });
});

describe("chains KPIs", () => {
  const c = buildChains(D, MS, "rev");

  it("states the chains' turnover and its share of all sales", () => {
    expect(c.kpi.turnover).toBe(839_000);
    expect(c.kpi.turnoverShare).toBeCloseTo((100 * 839_000) / 1_339_000, 6);
  });

  it("counts chains and branches after merging", () => {
    expect(c.kpi.chainCount).toBe(7);
    expect(c.kpi.branchCount).toBe(11);
  });

  it("counts the quiet branches and what they bought in the window", () => {
    expect(c.kpi.dormantCount).toBe(5); // ויוינו חיפה, 2 x ביסקוטי, קינג קונג, אפס
    expect(c.kpi.dormantRev).toBe(30_000 + 40_000 + 10_000 + 15_000);
  });

  it("names the biggest chain that has gone entirely quiet: more than one branch, none with a status", () => {
    expect(c.kpi.quiet).toEqual({ name: "ביסקוטי", branches: 2 });
    // a one-record chain going quiet is a lost customer; a chain that moved to a distributor is not "quiet"
    expect(c.chains.filter((x) => x.branches.length > 1 && x.dormant.length === x.branches.length).map((x) => x.name)).toEqual(["ביסקוטי"]);
  });

  it("has no quiet chain when none qualifies", () => {
    // the two Biscotti records stop being a chain (indexes stay put, so the facts still line up)
    const base = chainD();
    const D2 = { ...base, cust: base.cust.map((x) => (x[1] === "ביסקוטי" ? cust(x[0], "", x[4]) : x)) };
    expect(buildChains(D2, MS, "rev").kpi.quiet).toBeNull();
  });
});

describe("chains search", () => {
  it("filters the tree by chain, by branch name or by SKU, ignoring case, and totals what is left", () => {
    expect(buildChains(D, MS, "rev", "ביסקוטי").shown.map((x) => x.name)).toEqual(["ביסקוטי"]);
    expect(buildChains(D, MS, "rev", "ויוינו חיפה").shown.map((x) => x.name)).toEqual(["ויוינו"]);
    expect(buildChains(D, MS, "rev", "s3").shown.map((x) => x.name)).toEqual(["אלי אברהמי"]);
    expect(buildChains(D, MS, "rev", "דיטוקס").shown.map((x) => x.name)).toEqual(["ויוינו", "בבקה"]);
    expect(buildChains(D, MS, "rev", "אין כזה").shown).toEqual([]);
    const f = buildChains(D, MS, "rev", "ביסקוטי");
    expect(f.totals.tot).toBe(50_000);
    expect(f.totals.months[16]).toBe(40_000);
    // the KPI strip is the whole portfolio, search or not
    expect(f.kpi.chainCount).toBe(7);
  });

  it("matches a merged branch by its label and by either record's name", () => {
    expect(buildChains(D, MS, "rev", "כיכר הבימה").shown.map((x) => x.name)).toEqual(["בבקה"]);
    expect(buildChains(D, MS, "rev", "נטו").shown.map((x) => x.name)).toEqual(["בבקה"]);
  });
});
