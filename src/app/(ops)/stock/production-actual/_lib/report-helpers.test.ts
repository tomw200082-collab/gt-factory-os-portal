// Tranche 050 — unit tests for the Production Report pure helpers
// (variance-band check C8, after-balance computation C10).
import { describe, expect, it } from "vitest";
import {
  computeAfterBalance,
  exceedsVarianceBand,
  fmtShortfallMessage,
  varianceReasonLabel,
  VARIANCE_REASON_CODES,
  VARIANCE_REASON_LABELS,
} from "./report-helpers";

describe("exceedsVarianceBand", () => {
  it("is false exactly on the ±2% band edge", () => {
    expect(exceedsVarianceBand("102", "100")).toBe(false);
    expect(exceedsVarianceBand("98", "100")).toBe(false);
  });

  it("is true just outside the band, both directions", () => {
    expect(exceedsVarianceBand("102.1", "100")).toBe(true);
    expect(exceedsVarianceBand("97.9", "100")).toBe(true);
  });

  it("is false when output equals planned", () => {
    expect(exceedsVarianceBand("100", "100")).toBe(false);
  });

  it("scales the band with the planned quantity", () => {
    // 2% of 50 = 1 → 51 is on the edge, 51.5 is over.
    expect(exceedsVarianceBand("51", "50")).toBe(false);
    expect(exceedsVarianceBand("51.5", "50")).toBe(true);
  });

  it("never triggers on unparseable or non-positive planned input", () => {
    expect(exceedsVarianceBand("abc", "100")).toBe(false);
    expect(exceedsVarianceBand("100", "abc")).toBe(false);
    expect(exceedsVarianceBand("", "100")).toBe(false);
    expect(exceedsVarianceBand("100", "0")).toBe(false);
    expect(exceedsVarianceBand("100", "-5")).toBe(false);
  });
});

describe("computeAfterBalance", () => {
  it("computes after = available − required and flags no shortfall", () => {
    const out = computeAfterBalance("10", "4");
    expect(out).toEqual({ available: 10, required: 4, after: 6, short: false });
  });

  it("flags a shortfall when after < 0", () => {
    const out = computeAfterBalance("3", "4.5");
    expect(out).toEqual({
      available: 3,
      required: 4.5,
      after: -1.5,
      short: true,
    });
  });

  it("treats exactly-zero after as NOT short", () => {
    const out = computeAfterBalance("4.5", "4.5");
    expect(out?.after).toBe(0);
    expect(out?.short).toBe(false);
  });

  it("kills float dust before the sign check (0.1 + 0.2 family)", () => {
    // 0.3 available − (0.1 + 0.2 computed requirement serialized as 0.30000000000000004)
    const out = computeAfterBalance("0.3", "0.30000000000000004");
    expect(out?.after).toBe(0);
    expect(out?.short).toBe(false);
  });

  it("returns null on missing or unparseable inputs (never blocks submit)", () => {
    expect(computeAfterBalance(null, "4")).toBeNull();
    expect(computeAfterBalance(undefined, "4")).toBeNull();
    expect(computeAfterBalance("abc", "4")).toBeNull();
    expect(computeAfterBalance("10", "?")).toBeNull();
  });

  it("handles negative available balances (already-short stock)", () => {
    const out = computeAfterBalance("-2", "3");
    expect(out).toEqual({ available: -2, required: 3, after: -5, short: true });
  });
});

describe("fmtShortfallMessage", () => {
  it("renders the plain-English shortfall line with uom", () => {
    expect(fmtShortfallMessage("Sencha Tea", 4.5, "KG")).toBe(
      "Short 4.5 KG of Sencha Tea — receive stock or reduce quantity",
    );
  });

  it("drops trailing zeros and the uom when absent", () => {
    expect(fmtShortfallMessage("Bottle Cap", 12, null)).toBe(
      "Short 12 of Bottle Cap — receive stock or reduce quantity",
    );
    expect(fmtShortfallMessage("Lime Juice", 1.25, "L")).toBe(
      "Short 1.25 L of Lime Juice — receive stock or reduce quantity",
    );
  });

  it("uses the absolute value of the shortfall", () => {
    expect(fmtShortfallMessage("Sugar", -3, "KG")).toBe(
      "Short 3 KG of Sugar — receive stock or reduce quantity",
    );
  });
});

describe("variance reason labels", () => {
  it("covers exactly the 7 backend codes", () => {
    expect(VARIANCE_REASON_CODES).toEqual([
      "material_shortage",
      "equipment",
      "quality_loss",
      "recipe_yield",
      "extra_demand",
      "counting_error",
      "other",
    ]);
    expect(Object.keys(VARIANCE_REASON_LABELS)).toHaveLength(7);
  });

  it("maps codes to human labels and passes unknowns through", () => {
    expect(varianceReasonLabel("material_shortage")).toBe("Material shortage");
    expect(varianceReasonLabel("equipment")).toBe("Equipment issue");
    expect(varianceReasonLabel(null)).toBeNull();
    expect(varianceReasonLabel(undefined)).toBeNull();
    expect(varianceReasonLabel("future_code")).toBe("future_code");
  });
});
