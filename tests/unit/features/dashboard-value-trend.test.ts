import { describe, expect, it } from "vitest";
import {
  reconstructValueSeries,
  type ValueMovement,
} from "@/app/(shared)/dashboard/_lib/value-trend";

// Window: 14 days ending Jun 14 2026 (local) → Jun 1 .. Jun 14.
const TODAY = new Date(2026, 5, 14, 12, 0, 0);
const ANCHOR = 1000;

const COSTS: Record<string, number | null> = { A: 5, B: 2.5, D: null };
const costOf = (id: string) => (id in COSTS ? COSTS[id] : null);

const movements: ValueMovement[] = [
  { when: "2026-06-14T08:00:00", item_id: "A", item_type: "RM", qty_delta: 10 }, // +50 today
  { when: "2026-06-13T09:00:00", item_id: "B", item_type: "PKG", qty_delta: -4 }, // −10 on Jun13
  { when: "2026-06-10T09:00:00", item_id: "C", item_type: "FG", qty_delta: 100 }, // FG → ignored
  { when: "2026-06-12T09:00:00", item_id: "D", item_type: "RM", qty_delta: 2 }, // RM but no cost
  { when: "2026-05-01T09:00:00", item_id: "A", item_type: "RM", qty_delta: 999 }, // outside window
];

describe("reconstructValueSeries", () => {
  const r = reconstructValueSeries(ANCHOR, movements, costOf, 14, TODAY);

  it("anchors the most recent point to the real current value", () => {
    expect(r.points).toHaveLength(14);
    expect(r.points[13].value).toBe(ANCHOR);
    expect(r.points[13].key).toBe("2026-06-14");
  });

  it("reconstructs earlier closes by unwinding priced movements", () => {
    // Jun13 close = 1000 − (Jun14 delta +50) = 950
    expect(r.points[12].value).toBeCloseTo(950);
    // Jun12 close = 950 − (Jun13 delta −10) = 960
    expect(r.points[11].value).toBeCloseTo(960);
    // nothing priced before Jun12 → flat back to the window start
    expect(r.points[0].value).toBeCloseTo(960);
  });

  it("ignores FG movements (only RM/PKG are valued)", () => {
    // The FG +100 on Jun10 must not move the line.
    expect(r.points[9].value).toBeCloseTo(960); // Jun10
  });

  it("counts RM/PKG movements and reports cost coverage", () => {
    // In-window RM/PKG: A, B, D = 3; priced: A, B = 2.
    expect(r.movementCount).toBe(3);
    expect(r.coverage).toBeCloseTo(2 / 3);
  });

  it("excludes movements outside the window", () => {
    // The May 1 +999 must not appear anywhere.
    expect(r.points.every((p) => p.value <= 1000 + 1e-9)).toBe(true);
  });

  it("returns a flat anchored line with full coverage when there are no movements", () => {
    const empty = reconstructValueSeries(ANCHOR, [], costOf, 7, TODAY);
    expect(empty.points).toHaveLength(7);
    expect(empty.movementCount).toBe(0);
    expect(empty.coverage).toBe(1);
    expect(empty.points.every((p) => p.value === ANCHOR)).toBe(true);
  });
});
