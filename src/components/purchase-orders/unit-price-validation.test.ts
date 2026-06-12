// ---------------------------------------------------------------------------
// Tranche 043 (Price Truth) — unit tests for the optional per-line
// unit_price_net validation added to validatePoDraft. The price is NEVER
// required: blank/absent values must produce no error in either mode; only a
// non-empty, non-numeric or negative value is flagged.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { validatePoDraft, type PoDraft } from "./types";

function baseDraft(overrides?: Partial<PoDraft>): PoDraft {
  return {
    supplierId: "sup-1",
    expectedDate: "2026-06-18",
    manualReason: "stockout on lemons",
    notes: "",
    lines: [
      { orderable_key: "component:c1", quantity: "5", uom: "UNIT" },
    ],
    ...overrides,
  };
}

describe("validatePoDraft — optional unit_price_net (Tranche 043)", () => {
  it("P1 absent price yields no error (field is optional)", () => {
    const errs = validatePoDraft(baseDraft(), "manual");
    expect(errs.line_items).toBeUndefined();
  });

  it("P2 blank / whitespace price yields no error", () => {
    const errs = validatePoDraft(
      baseDraft({
        lines: [
          {
            orderable_key: "component:c1",
            quantity: "5",
            uom: "UNIT",
            unit_price_net: "   ",
          },
        ],
      }),
      "manual",
    );
    expect(errs.line_items).toBeUndefined();
  });

  it("P3 a valid price (including 0) yields no error", () => {
    for (const price of ["0", "12.5", "3"]) {
      const errs = validatePoDraft(
        baseDraft({
          lines: [
            {
              orderable_key: "component:c1",
              quantity: "5",
              uom: "UNIT",
              unit_price_net: price,
            },
          ],
        }),
        "manual",
      );
      expect(errs.line_items).toBeUndefined();
    }
  });

  it("P4 a negative or non-numeric price is flagged on that line only", () => {
    for (const price of ["-1", "abc"]) {
      const errs = validatePoDraft(
        baseDraft({
          lines: [
            { orderable_key: "component:c1", quantity: "5", uom: "UNIT" },
            {
              orderable_key: "item:i1",
              quantity: "2",
              uom: "UNIT",
              unit_price_net: price,
            },
          ],
        }),
        "manual",
      );
      expect(errs.line_items?.[0]).toBeUndefined();
      expect(errs.line_items?.[1]?.unit_price_net).toMatch(/0 or more/i);
    }
  });

  it("P5 price validation also applies in recommendation mode", () => {
    const errs = validatePoDraft(
      baseDraft({
        manualReason: "",
        lines: [
          {
            orderable_key: "component:c1",
            quantity: "5",
            uom: "UNIT",
            unit_price_net: "-3",
          },
        ],
      }),
      "recommendation",
    );
    expect(errs.manual_reason).toBeUndefined();
    expect(errs.line_items?.[0]?.unit_price_net).toBeTruthy();
  });
});
