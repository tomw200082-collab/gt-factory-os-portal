import { describe, it, expect } from "vitest";
import { freshnessOf, STALE_MINUTES, validReportData } from "@/app/(sales)/_lib/report/freshness";
import type { ReportPayload } from "@/app/(sales)/_lib/report/types";
import { makeD } from "./_d";

// 06:15Z on 2026-09-27 is 09:15 in Israel (UTC+3 until the end of October).
const AT = "2026-09-27T06:15:00Z";
const t = (min: number) => Date.parse(AT) + min * 60_000;
const payload = (over: Partial<ReportPayload> = {}): ReportPayload => ({
  state: "ready", data_at: AT, published_at: AT, last_attempt: { at: AT, status: "published", error_code: null },
  stale: false, notes: {}, data: makeD(), ...over,
});

describe("report freshness", () => {
  it("is 'never' when the report has not been built, whatever else the payload says", () => {
    expect(freshnessOf(payload({ state: "never", data_at: null, data: null }), t(0)).kind).toBe("never");
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
    expect(validReportData(makeD())).toBe(true);
  });
  it("refuses anything the screen would have to guess at", () => {
    expect(validReportData(null)).toBe(false);
    expect(validReportData({})).toBe(false);
    expect(validReportData({ ...makeD(), rows: "x" })).toBe(false);
    expect(validReportData({ ...makeD(), months: ["2026-01"] })).toBe(false);
    expect(validReportData({ ...makeD(), partialIdx: 99 })).toBe(false);
    expect(validReportData({ ...makeD(), todayEpoch: "x" })).toBe(false);
  });
});
