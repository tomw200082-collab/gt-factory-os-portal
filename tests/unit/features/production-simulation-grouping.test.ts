// ---------------------------------------------------------------------------
// production-simulation-grouping.test.ts — unit tests for the pure grouping
// and sorting logic behind the "Date range plan" mode of
// /planning/production-simulation.
//
// Covers:
//   buildGroups   — supplier grouping + ordering (by-supplier view)
//   sortComponents — risk-first component ordering (by-product view)
//   coverage helpers — isShortStatus / coverageStrip / coverageRow
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  buildGroups,
  NO_SUPPLIER_KEY,
} from "@/app/(planning)/planning/production-simulation/_components/date-range/BySupplierView";
import { sortComponents } from "@/app/(planning)/planning/production-simulation/_components/date-range/ByProductView";
import {
  coverageRow,
  coverageStrip,
  isShortStatus,
} from "@/app/(planning)/planning/production-simulation/_components/date-range/shared";
import type {
  CoverageStatus,
  MaterialComponentLine,
} from "@/app/(planning)/planning/production-simulation/_components/date-range/types";

function line(
  overrides: Partial<MaterialComponentLine> = {},
): MaterialComponentLine {
  return {
    component_id: "C1",
    component_name: "Component",
    component_uom: "kg",
    component_class: null,
    group: "ingredient",
    total_required_qty: "10",
    on_hand_qty: "5",
    net_shortage_qty: "5",
    coverage_status: "partial",
    first_needed_date: "2026-06-01",
    shortage_date: null,
    supplier_id: "S1",
    supplier_short: "Supplier One",
    supplier_phone: null,
    sources: [],
    ...overrides,
  };
}

describe("buildGroups — by-supplier grouping", () => {
  it("groups components under their supplier_id", () => {
    const groups = buildGroups([
      line({ component_id: "A", supplier_id: "S1" }),
      line({ component_id: "B", supplier_id: "S1" }),
      line({ component_id: "C", supplier_id: "S2" }),
    ]);
    const s1 = groups.find((g) => g.supplierId === "S1");
    const s2 = groups.find((g) => g.supplierId === "S2");
    expect(s1?.components.map((c) => c.component_id).sort()).toEqual([
      "A",
      "B",
    ]);
    expect(s2?.components).toHaveLength(1);
  });

  it("collects components with no supplier under the NO_SUPPLIER group", () => {
    const groups = buildGroups([
      line({ component_id: "A", supplier_id: "S1" }),
      line({ component_id: "X", supplier_id: null, supplier_short: null }),
    ]);
    const none = groups.find((g) => g.key === NO_SUPPLIER_KEY);
    expect(none).toBeDefined();
    expect(none?.components).toHaveLength(1);
    expect(none?.supplierName).toBe("No supplier assigned");
  });

  it("orders suppliers with something to order ahead of fully-stocked ones", () => {
    const groups = buildGroups([
      line({ supplier_id: "Stocked", coverage_status: "covered" }),
      line({ supplier_id: "NeedsOrder", coverage_status: "not_covered" }),
    ]);
    expect(groups[0].supplierId).toBe("NeedsOrder");
    expect(groups[1].supplierId).toBe("Stocked");
  });

  it("always sorts the NO_SUPPLIER group last, even when it has orders", () => {
    const groups = buildGroups([
      line({ supplier_id: null, coverage_status: "not_covered" }),
      line({ supplier_id: "S1", coverage_status: "covered" }),
    ]);
    expect(groups[groups.length - 1].key).toBe(NO_SUPPLIER_KEY);
  });

  it("orders to-order suppliers by their earliest first-needed date", () => {
    const groups = buildGroups([
      line({
        supplier_id: "Later",
        coverage_status: "partial",
        first_needed_date: "2026-06-20",
      }),
      line({
        supplier_id: "Sooner",
        coverage_status: "partial",
        first_needed_date: "2026-06-02",
      }),
    ]);
    expect(groups[0].supplierId).toBe("Sooner");
  });

  it("counts only short components in toOrderCount and tracks earliest need", () => {
    const groups = buildGroups([
      line({
        component_id: "A",
        supplier_id: "S1",
        coverage_status: "covered",
        first_needed_date: "2026-06-01",
      }),
      line({
        component_id: "B",
        supplier_id: "S1",
        coverage_status: "not_covered",
        first_needed_date: "2026-06-10",
      }),
      line({
        component_id: "C",
        supplier_id: "S1",
        coverage_status: "partial",
        first_needed_date: "2026-06-05",
      }),
    ]);
    const s1 = groups.find((g) => g.supplierId === "S1");
    expect(s1?.toOrderCount).toBe(2);
    expect(s1?.earliestNeeded).toBe("2026-06-05");
  });

  it("within a supplier, sorts short components before covered ones", () => {
    const groups = buildGroups([
      line({
        component_id: "Covered",
        supplier_id: "S1",
        coverage_status: "covered",
        first_needed_date: "2026-06-01",
      }),
      line({
        component_id: "Short",
        supplier_id: "S1",
        coverage_status: "not_covered",
        first_needed_date: "2026-06-09",
      }),
    ]);
    const s1 = groups.find((g) => g.supplierId === "S1");
    expect(s1?.components[0].component_id).toBe("Short");
  });
});

describe("sortComponents — by-product ordering", () => {
  it("puts short components before covered components", () => {
    const sorted = sortComponents([
      line({ component_id: "Covered", coverage_status: "covered" }),
      line({ component_id: "Short", coverage_status: "partial" }),
    ]);
    expect(sorted.map((c) => c.component_id)).toEqual(["Short", "Covered"]);
  });

  it("breaks ties by first-needed date, then by name", () => {
    const sorted = sortComponents([
      line({
        component_id: "C",
        component_name: "Zebra",
        coverage_status: "partial",
        first_needed_date: "2026-06-05",
      }),
      line({
        component_id: "A",
        component_name: "Apple",
        coverage_status: "partial",
        first_needed_date: "2026-06-01",
      }),
      line({
        component_id: "B",
        component_name: "Apricot",
        coverage_status: "partial",
        first_needed_date: "2026-06-05",
      }),
    ]);
    expect(sorted.map((c) => c.component_id)).toEqual(["A", "B", "C"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      line({ component_id: "Covered", coverage_status: "covered" }),
      line({ component_id: "Short", coverage_status: "partial" }),
    ];
    sortComponents(input);
    expect(input[0].component_id).toBe("Covered");
  });
});

describe("coverage helpers", () => {
  it("treats partial / not_covered / no_stock_data as short", () => {
    expect(isShortStatus("partial")).toBe(true);
    expect(isShortStatus("not_covered")).toBe(true);
    expect(isShortStatus("no_stock_data")).toBe(true);
    expect(isShortStatus("covered")).toBe(false);
  });

  it("returns a non-empty accent class for every coverage status", () => {
    const all: CoverageStatus[] = [
      "covered",
      "partial",
      "not_covered",
      "no_stock_data",
    ];
    for (const status of all) {
      expect(coverageStrip(status).length).toBeGreaterThan(0);
      expect(coverageRow(status).length).toBeGreaterThan(0);
    }
  });

  it("flags shortages with the danger colour and covered with success", () => {
    expect(coverageStrip("not_covered")).toContain("danger");
    expect(coverageRow("not_covered")).toContain("danger");
    expect(coverageStrip("covered")).toContain("success");
  });
});
