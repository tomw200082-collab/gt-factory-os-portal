// ---------------------------------------------------------------------------
// Tranche 063 (FLOW-N01) — unit tests for summarizePoDraft, the pure rollup
// behind the manual-PO form's read-only summary card. Lines count once an
// orderable is chosen; money totals only over lines with a positive quantity
// AND a non-negative entered price; totalValue is null when nothing is priced.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { summarizePoDraft, type LineDraft } from "./types";

function line(overrides?: Partial<LineDraft>): LineDraft {
  return { orderable_key: "component:c1", quantity: "5", uom: "UNIT", ...overrides };
}

describe("summarizePoDraft (Tranche 063 FLOW-N01)", () => {
  it("S1 empty draft → zero lines, null total", () => {
    expect(summarizePoDraft([])).toEqual({
      lineCount: 0,
      pricedLineCount: 0,
      totalValue: null,
    });
  });

  it("S2 lines without an orderable are not counted", () => {
    const s = summarizePoDraft([line({ orderable_key: "" }), line()]);
    expect(s.lineCount).toBe(1);
  });

  it("S3 unpriced lines count but contribute no money (total stays null)", () => {
    const s = summarizePoDraft([line(), line({ orderable_key: "item:i1" })]);
    expect(s.lineCount).toBe(2);
    expect(s.pricedLineCount).toBe(0);
    expect(s.totalValue).toBeNull();
  });

  it("S4 priced lines sum qty × price; unpriced lines are excluded from money", () => {
    const s = summarizePoDraft([
      line({ quantity: "5", unit_price_net: "2.5" }),
      line({ orderable_key: "item:i1", quantity: "3", unit_price_net: "10" }),
      line({ orderable_key: "item:i2", quantity: "7" }),
    ]);
    expect(s.lineCount).toBe(3);
    expect(s.pricedLineCount).toBe(2);
    expect(s.totalValue).toBeCloseTo(5 * 2.5 + 3 * 10);
  });

  it("S5 blank / whitespace price is treated as unpriced", () => {
    const s = summarizePoDraft([line({ unit_price_net: "   " })]);
    expect(s.pricedLineCount).toBe(0);
    expect(s.totalValue).toBeNull();
  });

  it("S6 invalid quantity or negative price never contributes money", () => {
    const s = summarizePoDraft([
      line({ quantity: "abc", unit_price_net: "5" }),
      line({ orderable_key: "item:i1", quantity: "0", unit_price_net: "5" }),
      line({ orderable_key: "item:i2", quantity: "2", unit_price_net: "-1" }),
    ]);
    expect(s.lineCount).toBe(3);
    expect(s.pricedLineCount).toBe(0);
    expect(s.totalValue).toBeNull();
  });

  it("S7 zero price on a valid quantity is a legitimate priced line (₪0)", () => {
    const s = summarizePoDraft([line({ quantity: "4", unit_price_net: "0" })]);
    expect(s.pricedLineCount).toBe(1);
    expect(s.totalValue).toBe(0);
  });
});
