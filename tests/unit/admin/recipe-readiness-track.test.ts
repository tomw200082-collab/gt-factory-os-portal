// tests/unit/admin/recipe-readiness-track.test.ts
import { describe, expect, it } from "vitest";
import { computeTrackHealth } from "@/lib/admin/recipe-readiness";
import type {
  LineBlockerCategory,
  LinePipState,
  LineWarningCategory,
} from "@/lib/admin/recipe-readiness.types";

function pip(
  color: LinePipState["color"],
  cats: { warn?: LineWarningCategory[]; block?: LineBlockerCategory[] } = {},
): LinePipState {
  return {
    color,
    reasons: color === "green" ? [] : ["reason"],
    warningCategories: cats.warn ?? (color === "yellow" ? ["missing-supplier"] : []),
    blockerCategories: cats.block ?? (color === "red" ? ["invalid-qty"] : []),
    isHardBlock: color === "red",
  };
}

describe("computeTrackHealth — red conditions (cannot publish)", () => {
  it("red when no active version (no head linked)", () => {
    const r = computeTrackHealth({
      hasActiveVersion: false,
      pips: [],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("red");
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("red when active version has 0 lines", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("red");
    expect(r.blockers.some((s) => s.includes("ריק"))).toBe(true);
  });

  it("red when any line is red (qty<=0 or INACTIVE)", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("red"), pip("green")],
      trackLabel: "pack BOM",
    });
    expect(r.color).toBe("red");
  });
});

describe("computeTrackHealth — yellow / green", () => {
  it("yellow when at least one line is yellow and none red", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("yellow"), pip("green")],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("yellow");
  });

  it("green when version is active, has lines, all pips green", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("green"), pip("green")],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("green");
    expect(r.warnings).toEqual([]);
    expect(r.blockers).toEqual([]);
  });

  it("warnings count summarizes yellow-line categories separately", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["stale-price"] }),
        pip("green"),
      ],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("yellow");
    // Two distinct category summaries — supplier and price are separate buckets
    const joined = r.warnings.join(" | ");
    expect(joined).toContain("2 חומרים חסרי ספק ראשי");
    expect(joined).toMatch(/חומר אחד עם מחיר ישן/);
  });

  it("warnings use Hebrew singular vs plural correctly", () => {
    const oneMissing = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("yellow", { warn: ["missing-supplier"] }), pip("green")],
      trackLabel: "base formula",
    });
    expect(oneMissing.warnings.some((s) => s.includes("חומר אחד חסר ספק ראשי"))).toBe(true);

    const fiveMissing = computeTrackHealth({
      hasActiveVersion: true,
      pips: [
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
      ],
      trackLabel: "base formula",
    });
    expect(fiveMissing.warnings.some((s) => s.includes("5 חומרים חסרי ספק ראשי"))).toBe(true);
  });

  it("strong-stale-price counts toward stale-price summary (not a separate one)", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [
        pip("yellow", { warn: ["stale-price"] }),
        pip("yellow", { warn: ["strong-stale-price"] }),
      ],
      trackLabel: "base formula",
    });
    // Two yellow lines, both about price, summarized together
    expect(r.warnings.some((s) => /2 חומרים עם מחיר ישן/.test(s))).toBe(true);
  });

  it("lineCount mirrors pips.length", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("green")],
      trackLabel: "pack BOM",
    });
    expect(r.lineCount).toBe(2);
  });
});
