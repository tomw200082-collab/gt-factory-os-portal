// risk.test.ts — DR-018 A11Y-007 (Tranche 125).
//
// Locks CELL_TIER_LABEL / cellTierLabel so aria-labels never regress to a
// raw snake_case enum value.

import { describe, expect, it } from "vitest";
import { CELL_TIER_LABEL, cellTierLabel } from "./risk";
import type { CellTierWithProduction, DayCellTier } from "./types";

describe("CELL_TIER_LABEL", () => {
  it("has a plain-English label for every CellTierWithProduction value", () => {
    const keys: CellTierWithProduction[] = [
      "critical_stockout",
      "at_risk",
      "low",
      "medium",
      "healthy",
      "non_working",
    ];
    for (const k of keys) {
      expect(CELL_TIER_LABEL[k]).toBeTruthy();
      // No raw enum value should ever leak through as its own label.
      expect(CELL_TIER_LABEL[k]).not.toContain("_");
    }
  });

  it("matches the exact locked copy", () => {
    expect(CELL_TIER_LABEL).toEqual({
      critical_stockout: "Stockout",
      at_risk: "At Risk",
      low: "Low stock",
      medium: "Medium stock",
      healthy: "Healthy",
      non_working: "Non-working day",
    });
  });
});

describe("cellTierLabel", () => {
  it("resolves every CellTierWithProduction value", () => {
    expect(cellTierLabel("critical_stockout")).toBe("Stockout");
    expect(cellTierLabel("at_risk")).toBe("At Risk");
    expect(cellTierLabel("low")).toBe("Low stock");
    expect(cellTierLabel("medium")).toBe("Medium stock");
    expect(cellTierLabel("healthy")).toBe("Healthy");
    expect(cellTierLabel("non_working")).toBe("Non-working day");
  });

  it("also resolves the coarser DayCellTier fallback values (watch/critical/stockout)", () => {
    const fallbackOnly: DayCellTier[] = ["watch", "critical", "stockout"];
    for (const t of fallbackOnly) {
      const label = cellTierLabel(t);
      expect(label).toBeTruthy();
      expect(label).not.toContain("_");
    }
    expect(cellTierLabel("watch")).toBe("Watch");
    expect(cellTierLabel("critical")).toBe("Critical");
    expect(cellTierLabel("stockout")).toBe("Stockout");
  });
});
