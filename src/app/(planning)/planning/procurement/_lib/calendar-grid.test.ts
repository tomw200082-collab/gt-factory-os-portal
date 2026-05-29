// ---------------------------------------------------------------------------
// calendar-grid engine tests — Tranche 033.
//
//   G1 — buildGrid is Sunday-aligned, weeks*7 long, flags today/past/month
//   G2 — posToCalEntries maps session POs (active line count)
//   G3 — groupByDay buckets per order-by date, tier-sorted within a day
//   G4 — calTotals sums cost + per-tier counts
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  buildGrid,
  calTotals,
  groupByDay,
  posToCalEntries,
  type CalEntry,
} from "./calendar-grid";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";

describe("buildGrid", () => {
  it("G1 is Sunday-aligned, weeks*7 long, and flags today/past/month-start", () => {
    // 2026-05-29 is a Friday; the grid's first day is the prior Sunday 2026-05-24.
    const grid = buildGrid("2026-05-29", 2);
    expect(grid).toHaveLength(14);
    expect(grid[0].iso).toBe("2026-05-24");
    const today = grid.find((d) => d.iso === "2026-05-29");
    expect(today?.isToday).toBe(true);
    expect(grid[0].isPast).toBe(true); // 05-24 < 05-29
    // first-of-month marker
    const firstOfJune = grid.find((d) => d.iso === "2026-06-01");
    expect(firstOfJune?.showMonth).toBe(true);
    expect(firstOfJune?.monthIdx).toBe(5); // June (0-based)
  });

  it("G1b returns empty for an unparseable date", () => {
    expect(buildGrid("nope", 2)).toEqual([]);
  });
});

function po(
  id: string,
  over: Partial<PurchaseSessionPo> = {},
): PurchaseSessionPo {
  return {
    session_po_id: id,
    supplier_id: `sup_${id}`,
    supplier_snapshot: `ספק ${id}`,
    tier: "must",
    status: "proposed",
    order_by_date: "2026-06-05",
    earliest_need_date: null,
    covered_through_date: null,
    currency: "ILS",
    total_cost: 100,
    order_document_text: null,
    po_id: null,
    blocking_issues: [],
    lines: [
      {
        session_po_line_id: `${id}_l1`,
        component_id: "c1",
        item_id: null,
        line_label: "x",
        recommended_qty: 1,
        final_qty: 1,
        uom: "UNIT",
        unit_cost: 1,
        line_cost: 1,
        earliest_need_date: null,
        coverage_trace: null,
        is_user_added: false,
        is_dropped: false,
      },
      {
        session_po_line_id: `${id}_l2`,
        component_id: "c2",
        item_id: null,
        line_label: "y",
        recommended_qty: 1,
        final_qty: 0,
        uom: "UNIT",
        unit_cost: 1,
        line_cost: 0,
        earliest_need_date: null,
        coverage_trace: null,
        is_user_added: false,
        is_dropped: true, // dropped → excluded from line_count
      },
    ],
    ...over,
  };
}

describe("posToCalEntries", () => {
  it("G2 maps POs and counts only active (non-dropped) lines", () => {
    const entries = posToCalEntries([po("a")]);
    expect(entries).toHaveLength(1);
    expect(entries[0].session_po_id).toBe("a");
    expect(entries[0].line_count).toBe(1); // 2 lines, 1 dropped
  });
});

describe("groupByDay + calTotals", () => {
  const entries: CalEntry[] = [
    { session_po_id: "a", supplier_snapshot: "A", tier: "recommended", status: "proposed", total_cost: 50, line_count: 1, order_by_date: "2026-06-05" },
    { session_po_id: "b", supplier_snapshot: "B", tier: "urgent", status: "proposed", total_cost: 30, line_count: 1, order_by_date: "2026-06-05" },
    { session_po_id: "c", supplier_snapshot: "C", tier: "must", status: "proposed", total_cost: 20, line_count: 1, order_by_date: "2026-06-07" },
  ];

  it("G3 buckets by day and sorts urgent→must→recommended within a day", () => {
    const m = groupByDay(entries);
    expect(m.get("2026-06-05")?.map((e) => e.session_po_id)).toEqual(["b", "a"]);
    expect(m.get("2026-06-07")?.map((e) => e.session_po_id)).toEqual(["c"]);
  });

  it("G4 totals cost and per-tier counts", () => {
    const t = calTotals(entries);
    expect(t.count).toBe(3);
    expect(t.cost).toBe(100);
    expect(t.byTier).toEqual({ urgent: 1, must: 1, recommended: 1 });
  });
});
