// ---------------------------------------------------------------------------
// inventory-flow-format.test.ts — unit tests for the pure number/date
// formatters in inventory-flow/_lib/format.ts.
//
// These formatters back every quantity, days-cover label, and percent shown
// on the Inventory Flow board, so the edge cases (em-dash for zero/null,
// typographic minus, exact-integer Tom mandate, semantic cover labels) are
// load-bearing. Pure module — node-only, deterministic.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  daysCoverTierClass,
  fmtDaysOfCover,
  fmtPct,
  fmtQty,
  formatCompact,
  formatDaysCover,
} from "@/app/(planning)/planning/inventory-flow/_lib/format";

const EM_DASH = "—"; // —
const MINUS = "−"; // − (U+2212, not a hyphen)

describe("fmtQty", () => {
  it("returns em-dash for zero, null, undefined, and non-finite", () => {
    expect(fmtQty(0)).toBe(EM_DASH);
    expect(fmtQty(null)).toBe(EM_DASH);
    expect(fmtQty(undefined)).toBe(EM_DASH);
    expect(fmtQty(Number.NaN)).toBe(EM_DASH);
    expect(fmtQty(Number.POSITIVE_INFINITY)).toBe(EM_DASH);
  });

  it("prints exact integers with thousands separator (no K/M abbreviation)", () => {
    expect(fmtQty(42)).toBe("42");
    expect(fmtQty(1234)).toBe("1,234");
    expect(fmtQty(12500)).toBe("12,500");
  });

  it("uses a typographic minus for negatives", () => {
    expect(fmtQty(-42.75)).toBe(`${MINUS}43`); // |n| >= 10 → rounded integer
    expect(fmtQty(-1158)).toBe(`${MINUS}1,158`);
  });

  it("preserves one decimal for small fractional magnitudes (|n| < 10)", () => {
    expect(fmtQty(-4.5)).toBe(`${MINUS}4.5`);
    expect(fmtQty(3.5)).toBe("3.5");
    // an integer < 10 has no decimal noise
    expect(fmtQty(7)).toBe("7");
  });
});

describe("formatCompact", () => {
  it("renders exact integers (never K/M) and em-dash for null", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(42)).toBe("42");
    expect(formatCompact(12500)).toBe("12,500");
    expect(formatCompact(null)).toBe(EM_DASH);
    expect(formatCompact(Number.NaN)).toBe(EM_DASH);
  });

  it("rounds and applies a typographic minus for negatives", () => {
    expect(formatCompact(-389.75)).toBe(`${MINUS}390`);
    expect(formatCompact(-1158)).toBe(`${MINUS}1,158`);
  });
});

describe("fmtDaysOfCover", () => {
  it("caps at 999+ and uses one decimal only below 10", () => {
    expect(fmtDaysOfCover(999)).toBe("999+");
    expect(fmtDaysOfCover(1000)).toBe("999+");
    expect(fmtDaysOfCover(5)).toBe("5.0");
    expect(fmtDaysOfCover(15)).toBe("15");
    expect(fmtDaysOfCover(null)).toBe(EM_DASH);
  });
});

describe("fmtPct", () => {
  it("rounds a [0,1] fraction to a whole-percent string", () => {
    expect(fmtPct(0.183)).toBe("18%");
    expect(fmtPct(0)).toBe("0%");
    expect(fmtPct(1)).toBe("100%");
    expect(fmtPct(Number.NaN)).toBe("0%");
  });
});

describe("formatDaysCover", () => {
  it("maps negative cover to STOCKOUT", () => {
    expect(formatDaysCover(-1)).toEqual({ value: "STOCKOUT", sub: "" });
  });

  it("maps day/week bands to semantic labels", () => {
    expect(formatDaysCover(0)).toEqual({ value: "0d", sub: "cover" });
    expect(formatDaysCover(5)).toEqual({ value: "5d", sub: "cover" });
    expect(formatDaysCover(7)).toEqual({ value: "1w", sub: "cover" });
    expect(formatDaysCover(13)).toEqual({ value: "1w", sub: "cover" });
    expect(formatDaysCover(14)).toEqual({ value: "2w", sub: "cover" });
    expect(formatDaysCover(21)).toEqual({ value: "3w", sub: "cover" });
    expect(formatDaysCover(28)).toEqual({ value: ">3w", sub: "cover" });
  });

  it("returns an em-dash value for null/non-finite", () => {
    expect(formatDaysCover(null)).toEqual({ value: EM_DASH, sub: "" });
    expect(formatDaysCover(Number.NaN)).toEqual({ value: EM_DASH, sub: "" });
  });
});

describe("daysCoverTierClass", () => {
  it("mirrors the server-side cell_tier_with_production thresholds", () => {
    expect(daysCoverTierClass(-1)).toBe("text-tier-critical-bg");
    expect(daysCoverTierClass(3)).toBe("text-tier-at-risk-bg");
    expect(daysCoverTierClass(10)).toBe("text-tier-low-bg");
    expect(daysCoverTierClass(18)).toBe("text-tier-medium-bg");
    expect(daysCoverTierClass(30)).toBe("text-tier-healthy-bg");
    expect(daysCoverTierClass(null)).toBe("text-fg-muted");
  });

  it("uses the documented boundary values (7 / 14 / 21)", () => {
    expect(daysCoverTierClass(7)).toBe("text-tier-low-bg");
    expect(daysCoverTierClass(14)).toBe("text-tier-medium-bg");
    expect(daysCoverTierClass(21)).toBe("text-tier-healthy-bg");
  });
});
