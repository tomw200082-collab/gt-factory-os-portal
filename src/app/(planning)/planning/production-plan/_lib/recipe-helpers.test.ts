// Tranche 052 — unit tests for the RecipeOverridePanel pure helpers.

import { describe, it, expect } from "vitest";
import {
  trimQtyText,
  parseQtyInput,
  fmtComputedQty,
  computeLineTotal,
  availabilityTier,
  lineDiffStatus,
  toWorkingLines,
  standardWorkingLines,
  isSameAsStandard,
  validateWorkingSet,
  buildPutLines,
  type WorkingRecipeLine,
} from "./recipe-helpers";
import type { PlanRecipeResponse } from "./recipe-types";

function line(over: Partial<WorkingRecipeLine>): WorkingRecipeLine {
  return {
    component_id: "C1",
    component_name: "Sencha Tea",
    qty: "0.5",
    uom: "KG",
    available_qty: "100",
    standard_qty_per_unit: "0.5",
    in_standard: true,
    ...over,
  };
}

const baseResponse: PlanRecipeResponse = {
  plan_id: "P1",
  item_id: "FG1",
  item_name: "Iced Tea 1L",
  planned_qty: "440",
  uom: "bottle",
  status: "planned",
  customized: true,
  override_id: "O1",
  note: null,
  base_bom_head_id: "BH1",
  base_bom_version_id: "BV2",
  override_base_bom_version_id: "BV1",
  liquid_lines: [
    {
      component_id: "C1",
      component_name: "Sencha Tea",
      qty_per_unit: "0.04500000",
      uom: "KG",
      available_qty: "25.00000000",
      standard_qty_per_unit: "0.04500000",
      in_standard: true,
    },
    {
      component_id: "C2",
      component_name: "Honey",
      qty_per_unit: "0.10000000",
      uom: "KG",
      available_qty: "10.00000000",
      standard_qty_per_unit: "0.08000000",
      in_standard: true,
    },
    {
      component_id: "C3",
      component_name: "Mint Extract",
      qty_per_unit: "0.01000000",
      uom: "L",
      available_qty: "0",
      standard_qty_per_unit: null,
      in_standard: false,
    },
  ],
  removed_standard_lines: [
    {
      component_id: "C4",
      component_name: "Lemon Juice",
      standard_qty_per_unit: "0.05000000",
      uom: "L",
    },
  ],
};

describe("trimQtyText", () => {
  it("trims trailing zeros from qty_8dp text", () => {
    expect(trimQtyText("0.50000000")).toBe("0.5");
    expect(trimQtyText("12.00000000")).toBe("12");
    expect(trimQtyText("0.04500000")).toBe("0.045");
  });
  it("leaves integers and odd strings alone", () => {
    expect(trimQtyText("440")).toBe("440");
    expect(trimQtyText("abc")).toBe("abc");
    expect(trimQtyText(null)).toBe("");
    expect(trimQtyText(undefined)).toBe("");
  });
});

describe("parseQtyInput", () => {
  it("parses plain decimals", () => {
    expect(parseQtyInput("0.5")).toBe(0.5);
    expect(parseQtyInput(" 12 ")).toBe(12);
  });
  it("returns null for empty or non-numeric", () => {
    expect(parseQtyInput("")).toBeNull();
    expect(parseQtyInput("abc")).toBeNull();
  });
});

describe("fmtComputedQty", () => {
  it("formats integers without decimals", () => {
    expect(fmtComputedQty(20)).toBe("20");
  });
  it("trims to at most 4 decimals", () => {
    expect(fmtComputedQty(19.8)).toBe("19.8");
    expect(fmtComputedQty(0.123456)).toBe("0.1235");
  });
  it("renders a dash for null / non-finite", () => {
    expect(fmtComputedQty(null)).toBe("—");
    expect(fmtComputedQty(Number.NaN)).toBe("—");
  });
});

describe("computeLineTotal", () => {
  it("multiplies qty-per-unit by planned qty", () => {
    expect(computeLineTotal("0.045", "440")).toBeCloseTo(19.8, 8);
    expect(computeLineTotal("0.5", "100")).toBe(50);
  });
  it("rounds away float dust", () => {
    expect(computeLineTotal("0.1", "3")).toBe(0.3);
  });
  it("returns null on blank or invalid input", () => {
    expect(computeLineTotal("", "440")).toBeNull();
    expect(computeLineTotal("abc", "440")).toBeNull();
    expect(computeLineTotal("-1", "440")).toBeNull();
  });
});

describe("availabilityTier", () => {
  it("is short when available < total", () => {
    expect(availabilityTier("10", 19.8)).toBe("short");
  });
  it("is tight when it covers the run with under 10% headroom", () => {
    expect(availabilityTier("20", 19.8)).toBe("tight");
    expect(availabilityTier("21", 19.8)).toBe("tight"); // 19.8*1.1 = 21.78
  });
  it("is ok with comfortable headroom or a zero total", () => {
    expect(availabilityTier("25", 19.8)).toBe("ok");
    expect(availabilityTier("0", 0)).toBe("ok");
  });
  it("is unknown when either side is missing", () => {
    expect(availabilityTier(null, 19.8)).toBe("unknown");
    expect(availabilityTier("25", null)).toBe("unknown");
    expect(availabilityTier("n/a", 19.8)).toBe("unknown");
  });
});

describe("lineDiffStatus", () => {
  it("flags non-standard components as added", () => {
    expect(
      lineDiffStatus(line({ in_standard: false, standard_qty_per_unit: null })),
    ).toBe("added");
  });
  it("flags qty drift as changed", () => {
    expect(
      lineDiffStatus(line({ qty: "0.6", standard_qty_per_unit: "0.5" })),
    ).toBe("changed");
  });
  it("treats numerically-equal text as unchanged", () => {
    expect(
      lineDiffStatus(line({ qty: "0.5", standard_qty_per_unit: "0.50000000" })),
    ).toBe("unchanged");
  });
});

describe("toWorkingLines / standardWorkingLines", () => {
  it("converts effective lines with trimmed quantities", () => {
    const w = toWorkingLines(baseResponse);
    expect(w).toHaveLength(3);
    expect(w[0].qty).toBe("0.045");
    expect(w[2].in_standard).toBe(false);
  });
  it("reconstructs the standard set incl. removed lines at standard qty", () => {
    const std = standardWorkingLines(baseResponse);
    expect(std.map((l) => l.component_id).sort()).toEqual(["C1", "C2", "C4"]);
    const honey = std.find((l) => l.component_id === "C2");
    expect(honey?.qty).toBe("0.08"); // standard, not the overridden 0.1
    const lemon = std.find((l) => l.component_id === "C4");
    expect(lemon?.available_qty).toBeNull(); // balance unknown for removed lines
  });
});

describe("isSameAsStandard", () => {
  const std = standardWorkingLines(baseResponse);
  it("is true for an exact numeric match regardless of text form", () => {
    const working = std.map((l) => ({
      ...l,
      qty: l.qty.includes(".") ? `${l.qty}000` : `${l.qty}.000`,
    }));
    expect(isSameAsStandard(working, std)).toBe(true);
  });
  it("is false when a qty differs", () => {
    const working = std.map((l, i) => (i === 0 ? { ...l, qty: "9" } : l));
    expect(isSameAsStandard(working, std)).toBe(false);
  });
  it("is false when a component is missing or extra", () => {
    expect(isSameAsStandard(std.slice(1), std)).toBe(false);
    expect(
      isSameAsStandard(
        [...std, line({ component_id: "C9", in_standard: false })],
        std,
      ),
    ).toBe(false);
  });
});

describe("validateWorkingSet", () => {
  it("accepts a clean set", () => {
    expect(validateWorkingSet([line({})]).ok).toBe(true);
  });
  it("rejects an empty set with a reset hint", () => {
    const v = validateWorkingSet([]);
    expect(v.ok).toBe(false);
    expect(v.problem).toMatch(/Reset to standard/);
  });
  it("rejects duplicates, non-positive qty, and blank uom", () => {
    expect(
      validateWorkingSet([line({}), line({})]).problem,
    ).toMatch(/more than once/);
    expect(validateWorkingSet([line({ qty: "0" })]).problem).toMatch(
      /greater than 0/,
    );
    expect(validateWorkingSet([line({ uom: " " })]).problem).toMatch(
      /unit/,
    );
  });
});

describe("buildPutLines", () => {
  it("maps working lines to the PUT contract shape", () => {
    expect(
      buildPutLines([line({ qty: "0.045", uom: " KG " })]),
    ).toEqual([{ component_id: "C1", qty_per_output_unit: 0.045, uom: "KG" }]);
  });
});
