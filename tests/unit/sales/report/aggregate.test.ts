import { describe, it, expect } from "vitest";
import {
  aggregate,
  buildGrid,
  gridChildren,
  heatOf,
  keyOf,
  nextSort,
  priorTotals,
  sparkPoints,
  yoyCell,
} from "@/app/(sales)/_lib/report/aggregate";
import { periodMonths, priorMap } from "@/app/(sales)/_lib/report/period";
import { cust, fact, makeD, order, sku } from "./_d";

// Customers: 0 and 2 share the name "קפה א" (two Shopify records, one row); 1 is in a chain;
// 3 bought only last year. SKUs: two teas, a service line, and a service family with nothing.
function aggD() {
  return makeD({
    cust: [cust("קפה א"), cust("קפה ב", "רשת X"), cust("קפה א"), cust("מסעדה ג")],
    sku: [sku("S1", "תה פריש", "FRESH"), sku("S2", "תה דיטוקס", "DETOX"), sku("DEL", "משלוח", "משלוח"), sku("PIK", "פיקדון", "פיקדונות")],
    rows: [
      // 2026 (months 16..24), agorot
      fact(16, 0, 0, 10, 200_000),
      fact(17, 0, 1, 5, 100_000),
      fact(16, 2, 0, 2, 40_000),
      fact(16, 0, 2, 1, 3_500),
      fact(16, 0, 3, 0, 0),
      fact(17, 1, 0, 4, 80_000),
      fact(24, 1, 1, 3, 60_000),
      // 2025 (months 4..12) = the prior year of 16..24
      fact(4, 0, 0, 10, 100_000),
      fact(5, 1, 0, 3, 99_999),
      fact(6, 3, 0, 5, 300_000),
    ],
    orders: [order(0, 700, 1, 16, 600), order(1, 720, 1, 17, 600), order(3, 400, 1, 6, 600)],
  });
}
const MS = periodMonths(aggD().months, "2026"); // 16..24
const base = { dim: "cust" as const, period: "2026", unit: "rev" as const, q: "", sort: { col: "tot" as const, dir: "desc" as const } };

describe("aggregation", () => {
  it("keys a customer by name, so two records with one name are one row", () => {
    const D = aggD();
    expect(keyOf(D, "cust", 0, 0)).toBe("קפה א");
    expect(keyOf(D, "cust", 2, 0)).toBe("קפה א");
    expect(keyOf(D, "fam", 0, 1)).toBe("DETOX");
    expect(keyOf(D, "sku", 0, 1)).toBe("S2 · תה דיטוקס");
    const rows = aggregate(D, "cust", MS, "rev");
    const a = rows.find((r) => r.k === "קפה א");
    // 200000 + 40000 + 3500 + 0 in January, 100000 in February
    expect(a?.months[16]).toBe(243_500);
    expect(a?.months[17]).toBe(100_000);
    expect(a?.tot).toBe(343_500);
    expect(rows).toHaveLength(2);
  });

  it("sums units when asked for units", () => {
    const rows = aggregate(aggD(), "cust", MS, "units");
    expect(rows.find((r) => r.k === "קפה א")?.tot).toBe(10 + 5 + 2 + 1 + 0);
  });

  it("drills a parent into its children, by family for a customer and by SKU for a family", () => {
    const D = aggD();
    const byFam = aggregate(D, "fam", MS, "rev", { dim: "cust", key: "קפה א" });
    expect(Object.fromEntries(byFam.map((r) => [r.k, r.tot]))).toEqual({ FRESH: 240_000, DETOX: 100_000, "משלוח": 3_500, "פיקדונות": 0 });
    const bySku = aggregate(D, "sku", MS, "rev", { dim: "fam", key: "FRESH" });
    expect(bySku.map((r) => [r.k, r.tot])).toEqual([["S1 · תה פריש", 320_000]]);
  });

  it("totals the prior-year months for the same keys", () => {
    const D = aggD();
    const pm = priorMap(D.months, MS);
    const prior = priorTotals(D, "cust", pm, "rev");
    expect(prior.get("קפה א")).toBe(100_000);
    expect(prior.get("קפה ב")).toBe(99_999);
    expect(prior.get("מסעדה ג")).toBe(300_000);
    expect(priorTotals(D, "cust", null, "rev").size).toBe(0);
  });
});

describe("year over year cell", () => {
  it("is a percentage once the prior year reaches 1,000 shekels", () => {
    const c = yoyCell(150_000, 100_000, "rev");
    expect(c).toEqual({ kind: "pct", pct: 50, up: true });
    expect(yoyCell(50_000, 100_000, "rev")).toEqual({ kind: "pct", pct: -50, up: false });
  });
  it("is 'new' below 1,000 shekels of prior revenue, or 100 prior units", () => {
    expect(yoyCell(500_000, 99_999, "rev")).toEqual({ kind: "new" });
    expect(yoyCell(500_000, 0, "rev")).toEqual({ kind: "new" });
    expect(yoyCell(500, 99, "units")).toEqual({ kind: "new" });
    expect(yoyCell(500, 100, "units")).toEqual({ kind: "pct", pct: 400, up: true });
  });
});

describe("heat", () => {
  it("shades a month by how far it sits from the row's own average", () => {
    expect(heatOf(110, 100)).toEqual({ dir: "up", alpha: 0.1 });
    expect(heatOf(50, 100)).toEqual({ dir: "down", alpha: 0.22 });
    // beyond 100% away the shade stops growing: 0.07 + 0.30
    expect(heatOf(300, 100)).toEqual({ dir: "up", alpha: 0.37 });
  });
  it("leaves months within 8% of the average, empty months and empty rows unshaded", () => {
    expect(heatOf(107, 100)).toBeNull();
    expect(heatOf(93, 100)).toBeNull();
    expect(heatOf(108, 100)).toEqual({ dir: "up", alpha: 0.094 });
    expect(heatOf(0, 100)).toBeNull();
    expect(heatOf(10, 0)).toBeNull();
  });
});

describe("sparkline", () => {
  it("scales to the row's own peak and ends on a marker", () => {
    expect(sparkPoints([0, 5, 10], 86, 20)).toEqual({ path: "M2 18L43 10.5L84 3", last: [84, 3] });
  });
  it("draws nothing for a single month", () => {
    expect(sparkPoints([5], 86, 20)).toBeNull();
  });
});

describe("the customers grid", () => {
  it("lists customers by total, with share and year over year", () => {
    const g = buildGrid(aggD(), base);
    expect(g.ms).toEqual(MS);
    expect(g.hasYoy).toBe(true);
    expect(g.rows.map((r) => r.k)).toEqual(["קפה א", "קפה ב"]);
    const a = g.rows[0];
    expect(a.tot).toBe(343_500);
    expect(a.share).toBeCloseTo(71.04, 2); // 343500 / 483500
    expect(a.yoy).toEqual({ kind: "pct", pct: 243.5, up: true });
    expect(g.rows[1].yoy).toEqual({ kind: "new" }); // prior 99,999 is under 1,000 shekels
    expect(a.months[0]).toBe(243_500); // aligned to the period's months: index 0 = month 16
    expect(a.heat[0]).toEqual({ dir: "up", alpha: 0.37 });
    expect(a.spark).toHaveLength(9);
    expect(g.total.tot).toBe(483_500);
    expect(g.total.months[0]).toBe(243_500);
  });

  it("totals the prior year over everything that sold then, churned customers included", () => {
    const g = buildGrid(aggD(), base);
    // 100000 + 99999 + 300000: the customer who stopped buying still counts as last year's revenue
    expect(g.total.yoy?.up).toBe(false);
    expect(g.total.yoy?.pct).toBeCloseTo(((483_500 - 499_999) / 499_999) * 100, 6);
  });

  it("totals a search's prior year over the same filtered rows, not the whole prior year", () => {
    const g = buildGrid(aggD(), { ...base, q: "קפה ב" });
    expect(g.rows.map((r) => r.k)).toEqual(["קפה ב"]);
    expect(g.total.tot).toBe(140_000);
    // prior of the filtered customers only: 99,999 (the Artifact divided by the whole 499,999: -72%)
    expect(g.total.yoy?.pct).toBeCloseTo(((140_000 - 99_999) / 99_999) * 100, 6);
    expect(g.total.yoy?.up).toBe(true);
  });

  it("has no year-over-year column when a month of the period has no prior year", () => {
    const g = buildGrid(aggD(), { ...base, period: "all" });
    expect(g.hasYoy).toBe(false);
    expect(g.total.yoy).toBeNull();
    expect(g.rows[0].yoy).toBeNull();
  });

  it("searches a customer by name or by chain, ignoring case", () => {
    expect(buildGrid(aggD(), { ...base, q: "  קפה א " }).rows.map((r) => r.k)).toEqual(["קפה א"]);
    expect(buildGrid(aggD(), { ...base, q: "רשת x" }).rows.map((r) => r.k)).toEqual(["קפה ב"]);
    // a customer with no chain reads "ללא רשת" in the Artifact's search too
    expect(buildGrid(aggD(), { ...base, q: "ללא רשת" }).rows.map((r) => r.k)).toEqual(["קפה א"]);
    expect(buildGrid(aggD(), { ...base, q: "אין כזה" }).rows).toEqual([]);
  });

  it("says the summary is filtered while a search is active", () => {
    const all = buildGrid(aggD(), base).summary;
    expect(all).toEqual({ filtered: false, total: 483_500, orders: 2, customers: 3, rows: 2 });
    const f = buildGrid(aggD(), { ...base, q: "קפה ב" }).summary;
    expect(f.filtered).toBe(true);
    expect(f.total).toBe(140_000);
    expect(f.rows).toBe(1);
  });

  it("sorts by name, by a month, by year over year, and puts 'new' last either way", () => {
    expect(buildGrid(aggD(), { ...base, sort: { col: "k", dir: "asc" } }).rows.map((r) => r.k)).toEqual(["קפה א", "קפה ב"]);
    expect(buildGrid(aggD(), { ...base, sort: { col: "k", dir: "desc" } }).rows.map((r) => r.k)).toEqual(["קפה ב", "קפה א"]);
    // month 17 (February): 100000 vs 80000
    expect(buildGrid(aggD(), { ...base, sort: { col: 17, dir: "desc" } }).rows.map((r) => r.k)).toEqual(["קפה א", "קפה ב"]);
    expect(buildGrid(aggD(), { ...base, sort: { col: 17, dir: "asc" } }).rows.map((r) => r.k)).toEqual(["קפה ב", "קפה א"]);
    expect(buildGrid(aggD(), { ...base, sort: { col: "yoy", dir: "desc" } }).rows.map((r) => r.k)).toEqual(["קפה א", "קפה ב"]);
    expect(buildGrid(aggD(), { ...base, sort: { col: "yoy", dir: "asc" } }).rows.map((r) => r.k)).toEqual(["קפה א", "קפה ב"]);
  });

  it("caps the rows but not the totals", () => {
    const D = aggD();
    for (let i = 0; i < 5; i++) {
      D.cust.push(cust(`לקוח נוסף ${i}`));
      D.rows.push(fact(18, D.cust.length - 1, 0, 1, 1_000 + i));
    }
    const g = buildGrid(D, { ...base, cap: 3 });
    expect(g.rows).toHaveLength(3);
    expect(g.matched).toBe(7);
    expect(g.capped).toBe(true);
    expect(g.total.tot).toBe(483_500 + 1_000 + 1_001 + 1_002 + 1_003 + 1_004);
  });

  it("falls back to the default order when the chosen sort has no column in this period", () => {
    // month 3 is not in 2026, and 'all' has no year-over-year column: the sort is dropped, not left orphaned
    const g = buildGrid(aggD(), { ...base, sort: { col: 3, dir: "asc" } });
    expect(g.sort).toEqual({ col: "tot", dir: "desc" });
    expect(g.rows.map((r) => r.k)).toEqual(["קפה א", "קפה ב"]);
    const all = buildGrid(aggD(), { ...base, period: "all", sort: { col: "yoy", dir: "asc" } });
    expect(all.sort).toEqual({ col: "tot", dir: "desc" });
    // a sort that does apply is kept
    expect(buildGrid(aggD(), { ...base, sort: { col: 17, dir: "asc" } }).sort).toEqual({ col: 17, dir: "asc" });
    expect(buildGrid(aggD(), { ...base, sort: { col: "k", dir: "desc" } }).sort).toEqual({ col: "k", dir: "desc" });
  });

  it("walks the sort states: a name starts ascending, a number starts descending, a second press flips", () => {
    expect(nextSort({ col: "tot", dir: "desc" }, "k")).toEqual({ col: "k", dir: "asc" });
    expect(nextSort({ col: "k", dir: "asc" }, "k")).toEqual({ col: "k", dir: "desc" });
    expect(nextSort({ col: "k", dir: "asc" }, 17)).toEqual({ col: 17, dir: "desc" });
    expect(nextSort({ col: 17, dir: "desc" }, 17)).toEqual({ col: 17, dir: "asc" });
  });
});

describe("the products grid", () => {
  const prod = { ...base, dim: "fam" as const };

  it("lists families by total and hides a service family that sold nothing", () => {
    const g = buildGrid(aggD(), prod);
    expect(g.rows.map((r) => [r.k, r.tot])).toEqual([["FRESH", 320_000], ["DETOX", 160_000], ["משלוח", 3_500]]);
    expect(g.total.tot).toBe(483_500);
  });

  it("matches the family, a SKU code or a SKU title, and shows the family", () => {
    expect(buildGrid(aggD(), { ...prod, q: "fresh" }).rows.map((r) => r.k)).toEqual(["FRESH"]);
    expect(buildGrid(aggD(), { ...prod, q: "s2" }).rows.map((r) => r.k)).toEqual(["DETOX"]);
    expect(buildGrid(aggD(), { ...prod, q: "תה פריש" }).rows.map((r) => r.k)).toEqual(["FRESH"]);
  });

  it("drills a family into its SKUs, and a customer into its families", () => {
    const D = aggD();
    const skus = gridChildren(D, prod, "FRESH");
    expect(skus.map((r) => [r.k, r.tot])).toEqual([["S1 · תה פריש", 320_000]]);
    const fams = gridChildren(D, base, "קפה א");
    expect(fams.map((r) => [r.k, r.tot])).toEqual([["FRESH", 240_000], ["DETOX", 100_000], ["משלוח", 3_500], ["פיקדונות", 0]]);
  });
});
