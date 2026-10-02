// The orders timeline: the circle's two years laid on a time axis (Tom, 2026-10-02).
import { describe, it, expect } from "vitest";
import { buildRing } from "@/app/(sales)/_lib/ring";
import { columnX, niceCeil, timelineMonths, yTicks, zoomLevels } from "@/app/(sales)/_lib/timeline";
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
