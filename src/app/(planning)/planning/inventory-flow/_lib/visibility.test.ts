import { describe, it, expect } from "vitest";
import { selectVisible, emptyStateKind } from "./visibility";

describe("selectVisible", () => {
  const items = [{ item_id: "a" }, { item_id: "b" }, { item_id: "c" }];
  it("returns all items when nothing hidden", () => {
    expect(selectVisible(items, new Set())).toHaveLength(3);
  });
  it("removes hidden items by item_id, preserving order", () => {
    const r = selectVisible(items, new Set(["b"]));
    expect(r.map((i) => i.item_id)).toEqual(["a", "c"]);
  });
});

describe("emptyStateKind", () => {
  it("returns null when visible rows exist", () => {
    expect(emptyStateKind(3, 5)).toBeNull();
  });
  it("returns all-hidden when nothing visible but the filter had rows", () => {
    expect(emptyStateKind(0, 5)).toBe("all-hidden");
  });
  it("returns no-match when the filter itself produced nothing", () => {
    expect(emptyStateKind(0, 0)).toBe("no-match");
  });
});
