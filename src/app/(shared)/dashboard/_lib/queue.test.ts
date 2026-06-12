// Tranche 060 — Today's Work queue ranking contract.
import { describe, expect, it } from "vitest";
import { mrpOnHandLine, rankQueue, type QueueRowSpec } from "./queue";

function row(overrides: Partial<QueueRowSpec>): QueueRowSpec {
  return {
    id: Math.random().toString(36).slice(2),
    severity: "warning",
    category: "slipped",
    title: "t",
    whyNow: null,
    at: null,
    ageLabel: null,
    href: "/x",
    cta: "Open",
    ...overrides,
  };
}

describe("rankQueue", () => {
  it("critical outranks warning regardless of category", () => {
    const { rows } = rankQueue([
      row({ id: "w", severity: "warning", category: "stops_production" }),
      row({ id: "c", severity: "critical", category: "late_po" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "w"]);
  });

  it("within a severity, category weight orders the rows", () => {
    const { rows } = rankQueue([
      row({ id: "late", category: "late_po" }),
      row({ id: "slip", category: "slipped" }),
      row({ id: "proc", category: "procurement" }),
      row({ id: "stop", category: "stops_production" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["stop", "proc", "slip", "late"]);
  });

  it("within a category, the oldest row leads and null timestamps rank last", () => {
    const { rows } = rankQueue([
      row({ id: "new", at: "2026-06-12T08:00:00Z" }),
      row({ id: "none", at: null }),
      row({ id: "old", at: "2026-06-10T08:00:00Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["old", "new", "none"]);
  });

  it("caps at 8 and reports the overflow", () => {
    const many = Array.from({ length: 11 }, (_, i) => row({ id: `r${i}` }));
    const { rows, overflow } = rankQueue(many);
    expect(rows).toHaveLength(8);
    expect(overflow).toBe(3);
  });

  it("does not mutate the input array", () => {
    const input = [row({ id: "b", severity: "warning" }), row({ id: "a", severity: "critical" })];
    rankQueue(input);
    expect(input[0].id).toBe("b");
  });
});

describe("mrpOnHandLine", () => {
  it("joins on-hand (with UOM) and cover", () => {
    expect(mrpOnHandLine({ onHand: 40, uom: "L", daysOfCover: 2.14 })).toBe(
      "On hand 40 L · 2.1d cover",
    );
  });

  it("returns null when nothing is resolvable", () => {
    expect(mrpOnHandLine({ onHand: null })).toBeNull();
  });

  it("clamps negative cover to zero", () => {
    expect(mrpOnHandLine({ onHand: 0, daysOfCover: -3 })).toBe("On hand 0 · 0d cover");
  });
});
