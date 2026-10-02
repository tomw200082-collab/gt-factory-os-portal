// The orders timeline: the circle's two years laid on a time axis (Tom, 2026-10-02).
import { describe, it, expect } from "vitest";
import { buildRing } from "@/app/(sales)/_lib/ring";
import { columnX, niceCeil, smoothPath, timelineMonths, trendSummary, yTicks, zoomLevels } from "@/app/(sales)/_lib/timeline";
import { circle } from "./_orgFixtures";

const months = () => {
  const r = buildRing(circle().months, [{ gid: "d", name: "#D", draft_status: "OPEN", created_at: "2026-09-25T08:00:00Z", age_days: 7 }]);
  return [...r.inner, ...r.outer];
};

describe("timelineMonths", () => {
  it("keeps the circle's 24 months, oldest first, with the same counts", () => {
    const t = timelineMonths(months());
    expect(t).toHaveLength(24);
    expect(t[0].ym).toBe("2024-11");
    expect(t[23].ym).toBe("2026-10");
    const sep = t.find((m) => m.ym === "2026-09")!;
    expect(sep.total).toBe(sep.filled + sep.hollow + sep.open);
    expect(sep.open).toBe(1);
  });

  it("draws the trend as a trailing three-month average of clean orders, from the third month", () => {
    const t = timelineMonths(months());
    expect(t[0].trend).toBeNull();
    expect(t[1].trend).toBeNull();
    expect(t[2].trend).toBeCloseTo((t[0].filled + t[1].filled + t[2].filled) / 3, 5);
  });

  it("marks the current month as in progress and draws no trend through it", () => {
    const t = timelineMonths(months());
    expect(t[23].partial).toBe(true);
    expect(t[22].partial).toBe(false);
    expect(t[23].trend).toBeNull();
    expect(t[22].trend).not.toBeNull();
  });
});

describe("scale and zoom", () => {
  it("rounds the axis up to a readable number", () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(7)).toBe(8);
    expect(niceCeil(13)).toBe(15);
    expect(niceCeil(41)).toBe(50);
  });

  it("zooms in by halving the scale until two orders fill the height", () => {
    expect(zoomLevels(37)).toEqual([40, 20, 10, 5, 2]);
    expect(zoomLevels(3)).toEqual([3, 2]);
    expect(zoomLevels(1)).toEqual([1]);
  });

  it("labels the axis with whole orders only", () => {
    expect(yTicks(10)).toEqual([0, 5, 10]);
    expect(yTicks(5)).toEqual([0, 2, 5]);
    expect(yTicks(1)).toEqual([0, 1]);
  });
});

describe("right-to-left time", () => {
  it("puts the oldest month at the right and the newest at the left", () => {
    const oldest = columnX(0, 24, 0, 480);
    const newest = columnX(23, 24, 0, 480);
    expect(oldest.x).toBeGreaterThan(newest.x);
    expect(newest.x).toBeCloseTo(0, 5);
    expect(oldest.x + oldest.w).toBeCloseTo(480, 5);
  });
});

describe("a stale mirror", () => {
  it("counts no month after the last good reconcile as full (code review I-2)", () => {
    // the last good read was 2026-09-20: September is not a full month, whatever the calendar says
    const t = timelineMonths(months(), "2026-09-20T05:00:00Z");
    expect(t.find((m) => m.ym === "2026-09")!.partial).toBe(true);
    expect(t.find((m) => m.ym === "2026-09")!.trend).toBeNull();
    expect(t.find((m) => m.ym === "2026-08")!.partial).toBe(false);
  });
});

describe("the headline", () => {
  const flat = (filled: number[]) =>
    timelineMonths(filled.map((f, i) => ({ ym: `2025-${String(i + 1).padStart(2, "0")}`, filled: f, refunded: 0, hollow: 0, open: 0 })));

  it("counts the clean orders of the two years", () => {
    expect(trendSummary(flat([1, 2, 3, 4, 5, 6, 7, 8])).total).toBe(36);
  });

  it("compares the last three full months with the three before, never the month in progress", () => {
    // full months: ..., 2,2,2 | 3,3,3 ; in progress: 0
    const s = trendSummary(flat([9, 2, 2, 2, 3, 3, 3, 0]));
    expect(s.recent).toBe(3);
    expect(s.prior).toBe(2);
    expect(s.direction).toBe("up");
    expect(s.pct).toBe(50);
  });

  it("calls a change under ten percent steady", () => {
    expect(trendSummary(flat([0, 10, 10, 10, 10, 10, 11, 0])).direction).toBe("flat");
  });

  it("says nothing about a trend it has no months for", () => {
    expect(trendSummary(flat([1, 1, 1])).direction).toBeNull();
    expect(trendSummary(flat([0, 0, 0, 0, 0, 0, 0, 0])).direction).toBeNull();
  });

  it("gives no percentage when the months before had no orders", () => {
    const s = trendSummary(flat([0, 0, 0, 0, 2, 1, 1, 0]));
    expect(s.direction).toBe("up");
    expect(s.pct).toBeNull();
  });
});

describe("the trend curve", () => {
  it("passes through every point and never dips below the lowest of two neighbours", () => {
    const d = smoothPath([[0, 100], [10, 0], [20, 0], [30, 100]]);
    expect(d.startsWith("M 0 100")).toBe(true);
    expect(d).toContain("10 0");
    expect(d).toContain("30 100");
    // monotone: the flat stretch stays flat (both control points at y = 0)
    const seg = d.split("C").map((x) => x.trim())[2];
    expect(seg.split(/[ ,]+/).filter((_, i) => i % 2 === 1).map(Number).every((y) => y === 0)).toBe(true);
  });
});
