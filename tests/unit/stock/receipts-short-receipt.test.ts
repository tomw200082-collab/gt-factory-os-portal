import { describe, expect, it } from "vitest";
import { computeShortReceiptLines } from "@/app/(ops)/stock/receipts/_components/types";
import type { PoLineOption } from "@/app/(ops)/stock/receipts/_components/types";

// ---------------------------------------------------------------------------
// Tranche 137 — short-receipt summary builder.
//
// Symmetric counterpart to the (pre-existing, untested-in-isolation)
// over-receipt check: a matched line that posts LESS than the remaining
// open_qty is a "short" receipt — expected and allowed, the PO line stays
// OPEN/PARTIAL for the rest. Locks down the boundary conditions so the
// pre-submit summary and success-panel delta stay correct.
// ---------------------------------------------------------------------------

function poLine(overrides: Partial<PoLineOption> = {}): PoLineOption {
  return {
    po_line_id: "PL1",
    line_number: 1,
    component_id: "C1",
    component_name: "Sugar 25kg",
    item_id: null,
    item_name: null,
    ordered_qty: "20",
    uom: "KG",
    received_qty: "0",
    open_qty: "20",
    line_status: "OPEN",
    ...overrides,
  };
}

describe("computeShortReceiptLines", () => {
  it("flags a matched line that posts less than open_qty", () => {
    const out = computeShortReceiptLines(
      [{ po_line_id: "PL1", quantity: "12", unit: "KG", label: "Sugar 25kg" }],
      [poLine({ open_qty: "20" })],
    );
    expect(out).toEqual([
      { idx: 0, label: "Sugar 25kg", unit: "KG", shortBy: 8 },
    ]);
  });

  it("does not flag an exact full receipt (quantity === open_qty)", () => {
    const out = computeShortReceiptLines(
      [{ po_line_id: "PL1", quantity: "20", unit: "KG", label: "Sugar 25kg" }],
      [poLine({ open_qty: "20" })],
    );
    expect(out).toEqual([]);
  });

  it("does not flag an over-receipt (quantity > open_qty) — that's the other guard's job", () => {
    const out = computeShortReceiptLines(
      [{ po_line_id: "PL1", quantity: "25", unit: "KG", label: "Sugar 25kg" }],
      [poLine({ open_qty: "20" })],
    );
    expect(out).toEqual([]);
  });

  it("ignores lines with no PO match (manual / unmatched lines)", () => {
    const out = computeShortReceiptLines(
      [{ po_line_id: "", quantity: "5", unit: "KG", label: "Loose item" }],
      [poLine({ open_qty: "20" })],
    );
    expect(out).toEqual([]);
  });

  it("ignores a zero/blank quantity (not yet entered, not a real short receipt)", () => {
    const out = computeShortReceiptLines(
      [{ po_line_id: "PL1", quantity: "0", unit: "KG", label: "Sugar 25kg" }],
      [poLine({ open_qty: "20" })],
    );
    expect(out).toEqual([]);
  });

  it("falls back to the PO line's own name when no label was resolved", () => {
    const out = computeShortReceiptLines(
      [{ po_line_id: "PL1", quantity: "5", unit: "KG", label: "" }],
      [poLine({ open_qty: "20", component_name: "Sugar 25kg" })],
    );
    expect(out[0].label).toBe("Sugar 25kg");
  });

  it("supports multiple lines, preserving original index", () => {
    const out = computeShortReceiptLines(
      [
        { po_line_id: "PL1", quantity: "20", unit: "KG", label: "Full" },
        { po_line_id: "PL2", quantity: "3", unit: "UNIT", label: "Short one" },
      ],
      [
        poLine({ po_line_id: "PL1", open_qty: "20" }),
        poLine({ po_line_id: "PL2", open_qty: "10", uom: "UNIT" }),
      ],
    );
    expect(out).toEqual([
      { idx: 1, label: "Short one", unit: "UNIT", shortBy: 7 },
    ]);
  });
});
