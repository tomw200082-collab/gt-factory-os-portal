import { describe, it, expect } from "vitest";
import { freshnessOf, historicNoteLine, STALE_MINUTES, validReportData } from "@/app/(sales)/_lib/report/freshness";
import type { ReportPayload } from "@/app/(sales)/_lib/report/types";
import { makeD, rampD } from "./_d";

// 06:15Z on 2026-09-27 is 09:15 in Israel (UTC+3 until the end of October).
const AT = "2026-09-27T06:15:00Z";
const t = (min: number) => Date.parse(AT) + min * 60_000;
const payload = (over: Partial<ReportPayload> = {}): ReportPayload => ({
  state: "ready", data_at: AT, published_at: AT, last_attempt: { at: AT, status: "published", error_code: null },
  stale: false, notes: {}, data: rampD(), ...over,
});

describe("report freshness", () => {
  it("is 'never' when the report has not been built, whatever else the payload says", () => {
    expect(freshnessOf(payload({ state: "never", data_at: null, data: null }), t(0)).kind).toBe("never");
  });

  it("says what the last attempt did when nothing was ever built", () => {
    const never = (status: "failed" | "running" | "skipped", error_code: string | null) =>
      freshnessOf(payload({ state: "never", data_at: null, data: null, last_attempt: { at: AT, status, error_code } }), t(0));
    expect(never("failed", "SALES_REPORT_GATE").why).toBe("gate");
    expect(never("failed", "boom").why).toBe("failed");
    expect(never("running", null).why).toBe("running");
    expect(freshnessOf(payload({ state: "never", data_at: null, data: null, last_attempt: null }), t(0)).why).toBeNull();
  });

  it("reads age in whole minutes and the data time in Israel clock", () => {
    const f = freshnessOf(payload(), t(12) + 40_000);
    expect(f).toMatchObject({ kind: "ready", stale: false, ageMinutes: 12, clock: "09:15", dateClock: "27/09 09:15", why: null });
  });

  it("is 'now' inside the first minute, and never negative when the clocks disagree", () => {
    expect(freshnessOf(payload(), t(0) + 30_000).ageMinutes).toBe(0);
    expect(freshnessOf(payload(), t(-5)).ageMinutes).toBe(0);
  });

  it("is stale when the server says so, and says why", () => {
    const failed = freshnessOf(payload({ stale: true, last_attempt: { at: AT, status: "failed", error_code: "recon_mismatch" } }), t(90));
    expect(failed).toMatchObject({ stale: true, why: "failed" });
    // only the reconciliation gate may say "did not match Shopify"
    const gate = freshnessOf(payload({ stale: true, last_attempt: { at: AT, status: "failed", error_code: "SALES_REPORT_GATE" } }), t(90));
    expect(gate.why).toBe("gate");
    expect(freshnessOf(payload({ stale: true, last_attempt: { at: AT, status: "skipped", error_code: null } }), t(90)).why).toBe("delayed");
    expect(freshnessOf(payload({ stale: true, last_attempt: null }), t(90)).why).toBe("delayed");
    expect(freshnessOf(payload({ stale: true, last_attempt: { at: AT, status: "running", error_code: null } }), t(90)).why).toBe("running");
    expect(freshnessOf(payload({ stale: true, last_attempt: { at: AT, status: "unchanged", error_code: null } }), t(90)).why).toBe("delayed");
  });

  it("is stale on the page's own clock too: a tab left open does not keep calling old data fresh", () => {
    expect(STALE_MINUTES).toBe(45);
    expect(freshnessOf(payload(), t(45)).stale).toBe(false);
    expect(freshnessOf(payload(), t(46)).stale).toBe(true);
    expect(freshnessOf(payload(), t(46)).why).toBe("delayed");
  });

  it("is not fresh without a data time", () => {
    const f = freshnessOf(payload({ data_at: null }), t(0));
    expect(f.kind).toBe("ready");
    expect(f.stale).toBe(true);
    expect(f.clock).toBeNull();
  });
});

describe("report data guard", () => {
  it("accepts the contract's shape", () => {
    expect(validReportData(rampD())).toBe(true);
  });
  it("refuses a hollow blob: right keys, nothing in them", () => {
    expect(validReportData(makeD())).toBe(false); // no rows, orders, customers or SKUs
    expect(validReportData({ ...rampD(), orders: [] })).toBe(false);
    expect(validReportData({ ...rampD(), cust: [] })).toBe(false);
    expect(validReportData({ ...rampD(), sku: [] })).toBe(false);
    expect(validReportData({ ...rampD(), rows: [] })).toBe(false);
  });
  it("refuses a month in progress that is not the last month", () => {
    expect(validReportData({ ...rampD(), partialIdx: 23 })).toBe(false);
  });
  it("refuses anything the screen would have to guess at", () => {
    expect(validReportData(null)).toBe(false);
    expect(validReportData({})).toBe(false);
    expect(validReportData({ ...rampD(), rows: "x" })).toBe(false);
    expect(validReportData({ ...rampD(), months: ["2026-01"] })).toBe(false);
    expect(validReportData({ ...rampD(), partialIdx: 99 })).toBe(false);
    expect(validReportData({ ...rampD(), todayEpoch: "x" })).toBe(false);
  });
});

describe("the build note about products outside the price list", () => {
  const note = { month: "2026-08", amount_ag: 1_234_500, threshold_ag: 500_000, top: [{ sku: "X-1", title: "מוצר ישן", rev_ag: 900_000 }] };
  it("says the month and the amount, neutrally", () => {
    expect(historicNoteLine(note)).toBe("באוגוסט ₪12,345 ממכירות מוצרים שאינם במחירון (מסווגים לפי שם המוצר)");
  });
  it("says nothing when the note is absent or malformed", () => {
    expect(historicNoteLine(undefined)).toBeNull();
    expect(historicNoteLine({ ...note, amount_ag: Number.NaN })).toBeNull();
    expect(historicNoteLine({ ...note, month: "x" })).toBeNull();
    expect(historicNoteLine(7 as never)).toBeNull();
  });
});
