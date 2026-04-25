// tests/unit/admin/recipe-readiness-top.test.ts
import { describe, expect, it } from "vitest";
import { computeRecipeHealthState } from "@/lib/admin/recipe-readiness";
import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

function track(over: Partial<TrackHealth>): TrackHealth {
  return {
    color: "green",
    hasActiveVersion: true,
    lineCount: 5,
    warnings: [],
    blockers: [],
    ...over,
  };
}

describe("computeRecipeHealthState", () => {
  it("green when both tracks are green", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({}),
    });
    expect(r.color).toBe("green");
    expect(r.label).toBe("Production-ready");
    expect(r.publishPermitted).toBe(true);
  });

  it("yellow when base green and pack yellow", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({ color: "yellow", warnings: ["1 אזהרה"] }),
    });
    expect(r.color).toBe("yellow");
    expect(r.label).toBe("Production-ready with warnings");
    expect(r.publishPermitted).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("red when pack is red — base green", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({ color: "red", blockers: ["ריק"], lineCount: 0 }),
    });
    expect(r.color).toBe("red");
    expect(r.label).toBe("Cannot publish");
    expect(r.publishPermitted).toBe(false);
  });

  it("red when base is red — pack green (symmetric to previous case)", () => {
    const r = computeRecipeHealthState({
      base: track({ color: "red", blockers: ["ריק"], lineCount: 0 }),
      pack: track({}),
    });
    expect(r.color).toBe("red");
    expect(r.publishPermitted).toBe(false);
  });

  it("publishPermitted is true when color is yellow", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({ color: "yellow", warnings: ["w1"] }),
    });
    expect(r.publishPermitted).toBe(true);
  });

  it("publishPermitted is true when color is green", () => {
    const r = computeRecipeHealthState({ base: track({}), pack: track({}) });
    expect(r.publishPermitted).toBe(true);
  });

  it("red trumps yellow trumps green when tracks disagree", () => {
    const r1 = computeRecipeHealthState({
      base: track({ color: "red", blockers: ["b1"] }),
      pack: track({ color: "yellow", warnings: ["w1"] }),
    });
    expect(r1.color).toBe("red");

    const r2 = computeRecipeHealthState({
      base: track({ color: "yellow", warnings: ["w1"] }),
      pack: track({ color: "yellow", warnings: ["w2"] }),
    });
    expect(r2.color).toBe("yellow");
  });

  it("aggregates blockers and warnings from both tracks", () => {
    const r = computeRecipeHealthState({
      base: track({ color: "yellow", warnings: ["base-w1"] }),
      pack: track({ color: "yellow", warnings: ["pack-w1"] }),
    });
    expect(r.warnings).toContain("base-w1");
    expect(r.warnings).toContain("pack-w1");
  });
});
