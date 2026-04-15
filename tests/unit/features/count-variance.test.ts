import { describe, expect, it } from "vitest";
import { classifyCountVariance } from "@/features/ops/count-variance";

describe("classifyCountVariance (Physical Count blind-flow branching)", () => {
  const thresholds = {
    auto_post_abs_floor: 2,
    auto_post_pct_ceiling: 5,
  };

  it("classifies an exact match as 'matched' with zero delta", () => {
    const result = classifyCountVariance({
      counted_quantity: 27,
      system_quantity: 27,
      ...thresholds,
    });
    expect(result.kind).toBe("matched");
    expect(result.delta).toBe(0);
    expect(result.variance_pct).toBe(0);
  });

  it("auto-posts a small percent variance (well under 5%)", () => {
    const result = classifyCountVariance({
      counted_quantity: 27.5,
      system_quantity: 27,
      ...thresholds,
    });
    expect(result.kind).toBe("auto");
    expect(result.delta).toBeCloseTo(0.5, 5);
    expect(result.variance_pct).toBeCloseTo(1.85, 1);
  });

  it("auto-posts a small absolute variance even when percent is large", () => {
    const result = classifyCountVariance({
      counted_quantity: 2,
      system_quantity: 0.1,
      ...thresholds,
    });
    expect(result.kind).toBe("auto");
    expect(result.delta).toBeCloseTo(1.9, 5);
    expect(result.variance_pct).toBe(1900);
  });

  it("routes a large variance (above both thresholds) to approval", () => {
    const result = classifyCountVariance({
      counted_quantity: 18,
      system_quantity: 27,
      ...thresholds,
    });
    expect(result.kind).toBe("approval");
    expect(result.delta).toBe(-9);
    expect(result.variance_pct).toBeCloseTo(33.33, 1);
  });

  it("routes negative variance (shrinkage) above threshold to approval", () => {
    const result = classifyCountVariance({
      counted_quantity: 0,
      system_quantity: 38,
      ...thresholds,
    });
    expect(result.kind).toBe("approval");
    expect(result.delta).toBe(-38);
  });

  it("handles zero system_quantity without dividing by zero", () => {
    const result = classifyCountVariance({
      counted_quantity: 10,
      system_quantity: 0,
      ...thresholds,
    });
    expect(result.kind).toBe("approval");
    expect(result.delta).toBe(10);
    expect(result.variance_pct).toBe(Infinity);
  });

  it("treats exactly-zero counted against zero system as matched", () => {
    const result = classifyCountVariance({
      counted_quantity: 0,
      system_quantity: 0,
      ...thresholds,
    });
    expect(result.kind).toBe("matched");
  });

  it("auto-posts positive-direction 'found stock' when small absolute", () => {
    const result = classifyCountVariance({
      counted_quantity: 28,
      system_quantity: 27,
      ...thresholds,
    });
    expect(result.kind).toBe("auto");
    expect(result.delta).toBe(1);
  });

  it("treats a sub-millisecond-precision match as 'matched' (< 0.001)", () => {
    const result = classifyCountVariance({
      counted_quantity: 27.0005,
      system_quantity: 27,
      ...thresholds,
    });
    expect(result.kind).toBe("matched");
  });
});
