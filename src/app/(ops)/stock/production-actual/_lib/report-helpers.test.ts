// Tranche 050 — unit tests for the Production Report pure helpers
// (variance-band check C8, after-balance computation C10).
import { describe, expect, it } from "vitest";
import {
  computeAfterBalance,
  exceedsVarianceBand,
  fmtShortfallMessage,
  planBoardReturnHref,
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
  it("computes after = available − required and flags no shortfall (consumes full requirement)", () => {
    const out = computeAfterBalance("10", "4");
    expect(out).toEqual({
      available: 10,
      required: 4,
      after: 6,
      short: false,
      consumed: 4,
      flooredAfter: 6,
      shortBy: 0,
    });
  });

  it("flags a shortfall when after < 0 and floors: consumes only what is available, remainder to 0", () => {
    const out = computeAfterBalance("3", "4.5");
    expect(out).toEqual({
      available: 3,
      required: 4.5,
      after: -1.5,
      short: true,
      consumed: 3, // floored to available
      flooredAfter: 0, // balance floors at 0, never negative
      shortBy: 1.5, // un-deductable remainder
    });
  });

  it("treats exactly-zero after as NOT short", () => {
    const out = computeAfterBalance("4.5", "4.5");
    expect(out?.after).toBe(0);
    expect(out?.short).toBe(false);
    expect(out?.consumed).toBe(4.5);
    expect(out?.flooredAfter).toBe(0);
    expect(out?.shortBy).toBe(0);
  });

  it("kills float dust before the sign check (0.1 + 0.2 family)", () => {
    // 0.3 available − (0.1 + 0.2 computed requirement serialized as 0.30000000000000004)
    const out = computeAfterBalance("0.3", "0.30000000000000004");
    expect(out?.after).toBe(0);
    expect(out?.short).toBe(false);
    expect(out?.flooredAfter).toBe(0);
    expect(out?.shortBy).toBe(0);
  });

  it("returns null on missing or unparseable inputs", () => {
    expect(computeAfterBalance(null, "4")).toBeNull();
    expect(computeAfterBalance(undefined, "4")).toBeNull();
    expect(computeAfterBalance("abc", "4")).toBeNull();
    expect(computeAfterBalance("10", "?")).toBeNull();
  });

  it("handles negative available balances (already-short stock): consumes nothing, floors at 0", () => {
    const out = computeAfterBalance("-2", "3");
    expect(out).toEqual({
      available: -2,
      required: 3,
      after: -5,
      short: true,
      consumed: 0, // nothing on hand to consume (negative treated as 0)
      flooredAfter: 0, // never adds stock, never goes more negative via this row
      shortBy: 3, // whole requirement is short
    });
  });
});

describe("fmtShortfallMessage", () => {
  it("renders the plain-English shortfall line with uom", () => {
    expect(fmtShortfallMessage("Sencha Tea", 4.5, "KG")).toBe(
      "Short 4.5 KG of Sencha Tea — will be deducted to 0",
    );
  });

  it("drops trailing zeros and the uom when absent", () => {
    expect(fmtShortfallMessage("Bottle Cap", 12, null)).toBe(
      "Short 12 of Bottle Cap — will be deducted to 0",
    );
    expect(fmtShortfallMessage("Lime Juice", 1.25, "L")).toBe(
      "Short 1.25 L of Lime Juice — will be deducted to 0",
    );
  });

  it("uses the absolute value of the shortfall", () => {
    expect(fmtShortfallMessage("Sugar", -3, "KG")).toBe(
      "Short 3 KG of Sugar — will be deducted to 0",
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

// Tranche 134 — return-to-board deep link.
describe("planBoardReturnHref", () => {
  it("carries the plan's week (Sunday-first) and the focus_plan id", () => {
    // 2026-07-15 is a Wednesday; its Sunday-first week starts 2026-07-12.
    expect(planBoardReturnHref("plan-abc", "2026-07-15")).toBe(
      "/planning/production-plan?week=2026-07-12&focus_plan=plan-abc",
    );
  });

  it("a Sunday plan date is its own week start", () => {
    expect(planBoardReturnHref("p1", "2026-07-12")).toBe(
      "/planning/production-plan?week=2026-07-12&focus_plan=p1",
    );
  });

  it("a Saturday plan date maps to the preceding Sunday", () => {
    expect(planBoardReturnHref("p1", "2026-07-18")).toBe(
      "/planning/production-plan?week=2026-07-12&focus_plan=p1",
    );
  });

  it("missing/invalid plan date still focuses the card, without a week param", () => {
    expect(planBoardReturnHref("p1", null)).toBe(
      "/planning/production-plan?focus_plan=p1",
    );
    expect(planBoardReturnHref("p1", "not-a-date")).toBe(
      "/planning/production-plan?focus_plan=p1",
    );
  });

  it("no plan id degrades to the plain board href", () => {
    expect(planBoardReturnHref(null, "2026-07-15")).toBe(
      "/planning/production-plan",
    );
    expect(planBoardReturnHref(undefined, undefined)).toBe(
      "/planning/production-plan",
    );
  });

  it("URL-encodes the plan id", () => {
    expect(planBoardReturnHref("a b/c", null)).toBe(
      "/planning/production-plan?focus_plan=a+b%2Fc",
    );
  });
});
