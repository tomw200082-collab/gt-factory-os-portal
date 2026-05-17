import { describe, expect, it } from "vitest";
import { componentItemType } from "@/lib/contracts/components";

// Pins the form-side component_class → item_type map to the API contract
// (COMPONENT_CLASS_BY_ITEM_TYPE in api/src/goods-receipts/handler.ts).
// The bug this guards: the goods-receipt and waste-adjustment forms hard-coded
// RM for every component, so packaging components 409'd with ITEM_TYPE_MISMATCH.
describe("componentItemType — component_class → stock-event item_type", () => {
  it("maps raw-material classes to RM", () => {
    expect(componentItemType("INGREDIENT")).toBe("RM");
    expect(componentItemType("PROCESS_SUPPLY")).toBe("RM");
  });

  it("maps packaging classes to PKG", () => {
    expect(componentItemType("PACKAGING")).toBe("PKG");
    expect(componentItemType("PACKAGING_SET")).toBe("PKG");
  });

  it("returns null for an unknown class so the caller blocks the line", () => {
    expect(componentItemType("WIDGET")).toBeNull();
    expect(componentItemType("")).toBeNull();
  });

  it("returns null for a missing class", () => {
    expect(componentItemType(null)).toBeNull();
    expect(componentItemType(undefined)).toBeNull();
  });
});
