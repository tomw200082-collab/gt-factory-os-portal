import { describe, expect, it } from "vitest";
import { loaderVariantFor } from "@/components/ui/loader-variant";

// One loading system, two environments: the Sales workspace (GT Pulse) under
// /sales/*, the factory portal everywhere else. The rule is a path rule, so it
// is pinned as a table.
describe("loaderVariantFor", () => {
  const table: Array<[string, "factory" | "sales"]> = [
    ["/sales", "sales"],
    ["/sales/", "sales"],
    ["/sales/today", "sales"],
    ["/sales/leads/abc-123", "sales"],
    ["/sales/x?y", "sales"],
    ["/sales?tab=2", "sales"],
    ["/sales#top", "sales"],
    ["/sales/today#anchor", "sales"],
    ["/salesy", "factory"],
    ["/sales-icons/apple-touch-icon.png", "factory"],
    ["/sale", "factory"],
    ["/admin/sales", "factory"],
    ["/home", "factory"],
    ["/apps", "factory"],
    ["/stock/receipts", "factory"],
    ["/", "factory"],
    ["", "factory"],
  ];

  for (const [path, variant] of table) {
    it(`${JSON.stringify(path)} -> ${variant}`, () => {
      expect(loaderVariantFor(path)).toBe(variant);
    });
  }
});
