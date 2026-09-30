import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "@/lib/auth/safe-redirect";

describe("safe sales deep link", () => {
  it("keeps a same-origin lead query", () => {
    expect(safeRedirectTarget("/sales/leads?lead=11111111-2222-3333-4444-555555555555"))
      .toBe("/sales/leads?lead=11111111-2222-3333-4444-555555555555");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/%2fevil.example", "/%5cevil.example", "/a\nb", "javascript:alert(1)", null])
    ("falls back for unsafe redirect %s", (value) => {
      expect(safeRedirectTarget(value)).toBe("/apps");
    });
});
