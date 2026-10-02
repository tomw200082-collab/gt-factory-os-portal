// The synthetic report world, read two ways: the figures below are what the canonical Artifact
// (build_report.py's page, run in a browser on the same data) printed, and the native modules must
// print the same ones. A change to a definition fails here before it reaches a screen.

import { describe, it, expect } from "vitest";
import { buildGrid } from "@/app/(sales)/_lib/report/aggregate";
import { buildChains } from "@/app/(sales)/_lib/report/chains";
import { dailyHero } from "@/app/(sales)/_lib/report/daily";
import { freshnessOf, validReportData } from "@/app/(sales)/_lib/report/freshness";
import { periodMonths } from "@/app/(sales)/_lib/report/period";
import { trendTiles } from "@/app/(sales)/_lib/report/trend";
import { DATA_AT, NOW_FRESH, REPORT_D, reportPayload } from "../../../e2e/_fixtures/salesReport";

const shekels = (agorot: number) => Math.round(agorot / 100);

describe("synthetic report: native modules against the Artifact's own figures", () => {
  it("is a well-formed blob", () => {
    expect(validReportData(REPORT_D)).toBe(true);
    expect(REPORT_D.months).toHaveLength(25);
    expect(freshnessOf(reportPayload("fresh"), NOW_FRESH)).toMatchObject({ stale: false, ageMinutes: 12, clock: "09:15" });
    expect(Date.parse(DATA_AT)).toBe(Date.UTC(2026, 8, 27, 6, 15));
  });

  it("trend tiles", () => {
    const t = trendTiles(REPORT_D, "rev");
    expect(shekels(t.t12)).toBe(3_396_671);
    expect(Math.round(t.d12 ?? NaN)).toBe(31);
    expect(shekels(t.lastFull)).toBe(258_585);
    expect(Math.round(t.dj ?? NaN)).toBe(17);
    expect(shekels(t.rate)).toBe(3_863_647);
    expect(shekels(t.partial)).toBe(597_433);
  });

  it("daily tiles and the pace paragraph", () => {
    const h = dailyHero(REPORT_D);
    expect(shekels(h.yRev)).toBe(14_600);
    expect(shekels(h.yBase ?? NaN)).toBe(16_936);
    expect(shekels(h.tRev)).toBe(24_801);
    expect(shekels(h.tBase)).toBe(6_289);
    expect(shekels(h.w1 / 7)).toBe(13_850);
    expect(shekels(h.w0 / 7)).toBe(43_161);
    expect(shekels(h.mtd)).toBe(597_433);
    expect(shekels(h.pmSame)).toBe(223_097);
    expect(shekels(h.pace.total)).toBe(638_136);
  });

  it("chains KPIs", () => {
    const c = buildChains(REPORT_D, periodMonths(REPORT_D.months, "2026"), "rev").kpi;
    expect(shekels(c.turnover)).toBe(1_119_721);
    expect(Math.round(c.turnoverShare)).toBe(38);
    expect([c.chainCount, c.branchCount, c.dormantCount]).toEqual([21, 36, 10]);
    expect(shekels(c.dormantRev)).toBe(23_081);
    expect(c.quiet).toEqual({ name: "ביסקוטי", branches: 3 });
  });

  it.each([
    ["12", 3_396_671, 3_285, 139],
    ["2026", 2_970_210, 2_579, 130],
    ["all", 6_586_508, 6_142, 157],
  ])("customers over %s: total, orders, customers", (period, total, orders, customers) => {
    const g = buildGrid(REPORT_D, { dim: "cust", period, unit: "rev", q: "", sort: { col: "tot", dir: "desc" } });
    expect(shekels(g.summary.total)).toBe(total);
    expect(g.summary.orders).toBe(orders);
    expect(g.summary.customers).toBe(customers);
  });

  it("the current year against last year, and the same total over products", () => {
    const g = buildGrid(REPORT_D, { dim: "cust", period: "2026", unit: "rev", q: "", sort: { col: "tot", dir: "desc" } });
    expect(Math.round(g.total.yoy?.pct ?? NaN)).toBe(40);
    const p = buildGrid(REPORT_D, { dim: "fam", period: "2026", unit: "rev", q: "", sort: { col: "tot", dir: "desc" } });
    expect(p.total.tot).toBe(g.total.tot);
  });
});
