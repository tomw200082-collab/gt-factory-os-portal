// tests/unit/admin/recipe-readiness-policy.test.ts
import { describe, expect, it } from "vitest";
import { RECIPE_READINESS_POLICY } from "@/lib/policy/recipe-readiness";

describe("RECIPE_READINESS_POLICY (v1 defaults)", () => {
  it("exposes price-age warn threshold as 90 days", () => {
    expect(RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS).toBe(90);
  });

  it("exposes price-age strong-warn threshold as 180 days", () => {
    expect(RECIPE_READINESS_POLICY.PRICE_AGE_STRONG_WARN_DAYS).toBe(180);
  });

  it("strong threshold is strictly greater than warn threshold", () => {
    expect(RECIPE_READINESS_POLICY.PRICE_AGE_STRONG_WARN_DAYS).toBeGreaterThan(
      RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS,
    );
  });

  it("frozen object — attempting mutation throws in strict mode", () => {
    expect(Object.isFrozen(RECIPE_READINESS_POLICY)).toBe(true);
  });
});
