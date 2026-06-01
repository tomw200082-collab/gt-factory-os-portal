import { describe, expect, it } from "vitest";
import {
  bucketTotal,
  dailyCounts,
  dailyFlow,
  lastNDays,
  localDayKey,
  trendDelta,
} from "@/app/(shared)/dashboard/_lib/trends";

// Fixed reference day: 14 June 2026, local noon. All timestamps below use a
// local (no-`Z`) ISO form so the bucketing is deterministic regardless of the
// runner's timezone.
const TODAY = new Date(2026, 5, 14, 12, 0, 0);

describe("lastNDays", () => {
  it("returns n days oldest → newest, inclusive of today", () => {
    const days = lastNDays(14, TODAY);
    expect(days).toHaveLength(14);
    expect(days[0].key).toBe("2026-06-01");
    expect(days[13].key).toBe("2026-06-14");
    // Locale-independent labels.
    expect(days[0].label).toBe("Jun 1");
    expect(days[13].label).toBe("Jun 14");
  });
});

describe("localDayKey", () => {
  it("formats a local calendar day as yyyy-mm-dd", () => {
    expect(localDayKey(new Date(2026, 0, 3))).toBe("2026-01-03");
    expect(localDayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("dailyCounts", () => {
  it("buckets timestamps into per-day counts and keeps empty days at zero", () => {
    const ts = [
      "2026-06-14T08:00:00",
      "2026-06-14T17:30:00",
      "2026-06-13T09:00:00",
    ];
    const buckets = dailyCounts(ts, 14, TODAY);
    expect(buckets).toHaveLength(14);
    expect(buckets[13]).toMatchObject({ key: "2026-06-14", value: 2 });
    expect(buckets[12]).toMatchObject({ key: "2026-06-13", value: 1 });
    expect(buckets[0]).toMatchObject({ key: "2026-06-01", value: 0 });
  });

  it("ignores timestamps outside the window and invalid/missing values", () => {
    const ts = [
      "2026-05-01T10:00:00", // older than the 14-day window
      "2099-01-01T10:00:00", // future, outside window
      null,
      undefined,
      "not-a-date",
      "2026-06-10T10:00:00", // in window
    ];
    const buckets = dailyCounts(ts, 14, TODAY);
    expect(bucketTotal(buckets)).toBe(1);
    expect(buckets.find((b) => b.key === "2026-06-10")?.value).toBe(1);
  });
});

describe("dailyFlow", () => {
  it("splits postings into inbound and outbound per day", () => {
    const rows = [
      { when: "2026-06-14T08:00:00", direction: "in" as const },
      { when: "2026-06-14T09:00:00", direction: "in" as const },
      { when: "2026-06-14T10:00:00", direction: "out" as const },
      { when: "2026-06-12T10:00:00", direction: "out" as const },
    ];
    const buckets = dailyFlow(rows, 14, TODAY);
    const d14 = buckets.find((b) => b.key === "2026-06-14");
    const d12 = buckets.find((b) => b.key === "2026-06-12");
    expect(d14).toMatchObject({ inbound: 2, outbound: 1 });
    expect(d12).toMatchObject({ inbound: 0, outbound: 1 });
    expect(bucketTotal(buckets)).toBe(4);
  });
});

describe("trendDelta", () => {
  it("compares the most recent half against the prior half", () => {
    // 14 buckets: prior 7 each value 1 (=7), recent 7 each value 3 (=21).
    const buckets = lastNDays(14, TODAY).map((d, i) => ({
      ...d,
      value: i < 7 ? 1 : 3,
    }));
    const delta = trendDelta(buckets);
    expect(delta.previous).toBe(7);
    expect(delta.current).toBe(21);
    expect(delta.direction).toBe("up");
    expect(delta.pct).toBeCloseTo(200);
  });

  it("returns a null pct when the prior half is empty", () => {
    const buckets = lastNDays(14, TODAY).map((d, i) => ({
      ...d,
      value: i < 7 ? 0 : 2,
    }));
    const delta = trendDelta(buckets);
    expect(delta.previous).toBe(0);
    expect(delta.current).toBe(14);
    expect(delta.pct).toBeNull();
    expect(delta.direction).toBe("up");
  });

  it("reports a flat trend when both halves match", () => {
    const buckets = lastNDays(14, TODAY).map((d) => ({ ...d, value: 2 }));
    const delta = trendDelta(buckets);
    expect(delta.direction).toBe("flat");
    expect(delta.pct).toBeCloseTo(0);
  });
});
