// tests/unit/admin/recipe-readiness-line-pip.test.ts
import { describe, expect, it } from "vitest";
import { computeLinePipState } from "@/lib/admin/recipe-readiness";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

const NOW = new Date("2026-04-25T12:00:00Z").getTime();

function comp(over: Partial<ComponentReadiness> = {}): ComponentReadiness {
  return {
    component_id: "C-1",
    component_name: "Sugar",
    component_status: "ACTIVE",
    primary_supplier_id: "SUP-1",
    primary_supplier_name: "Sweet Co",
    active_price_value: "2.50",
    active_price_updated_at: "2026-04-20T12:00:00Z",
    ...over,
  };
}

describe("computeLinePipState — green path", () => {
  it("returns green with empty reasons when component is fully ready and qty > 0", () => {
    const r = computeLinePipState({ qty: "1.0", component: comp(), nowMs: NOW });
    expect(r.color).toBe("green");
    expect(r.reasons).toEqual([]);
    expect(r.isHardBlock).toBe(false);
  });
});

describe("computeLinePipState — red (hard block)", () => {
  it("returns red when qty is 0", () => {
    const r = computeLinePipState({ qty: "0", component: comp(), nowMs: NOW });
    expect(r.color).toBe("red");
    expect(r.isHardBlock).toBe(true);
    expect(r.reasons.some((s) => s.includes("כמות"))).toBe(true);
  });

  it("returns red when qty is negative", () => {
    const r = computeLinePipState({ qty: "-1", component: comp(), nowMs: NOW });
    expect(r.color).toBe("red");
  });

  it("returns red when qty is non-numeric", () => {
    const r = computeLinePipState({ qty: "abc", component: comp(), nowMs: NOW });
    expect(r.color).toBe("red");
  });

  it("returns red when component is INACTIVE", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ component_status: "INACTIVE" }),
      nowMs: NOW,
    });
    expect(r.color).toBe("red");
    expect(r.reasons.some((s) => s.includes("לא פעיל"))).toBe(true);
  });

  it("red trumps yellow when both INACTIVE and missing supplier", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({
        component_status: "INACTIVE",
        primary_supplier_id: null,
      }),
      nowMs: NOW,
    });
    expect(r.color).toBe("red");
    // Yellow categories MUST NOT co-mingle with red. Red short-circuits.
    expect(r.warningCategories).toEqual([]);
    expect(r.blockerCategories).toContain("inactive-component");
    expect(r.reasons.some((s) => s.includes("ספק"))).toBe(false);
  });
});

describe("computeLinePipState — yellow (warning, not hard block)", () => {
  it("returns yellow when no primary supplier", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ primary_supplier_id: null, primary_supplier_name: null }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.isHardBlock).toBe(false);
    expect(r.reasons.some((s) => s.includes("ספק"))).toBe(true);
  });

  it("returns yellow when no active price record", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ active_price_value: null, active_price_updated_at: null }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.reasons.some((s) => s.includes("מחיר"))).toBe(true);
  });

  it("returns yellow when active price age exceeds PRICE_AGE_WARN_DAYS", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ active_price_updated_at: "2025-12-01T12:00:00Z" }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.reasons.some((s) => /\d+ ימים/.test(s))).toBe(true);
  });

  it("collects multiple reasons in yellow state", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({
        primary_supplier_id: null,
        primary_supplier_name: null,
        active_price_value: null,
        active_price_updated_at: null,
      }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r.warningCategories).toContain("missing-supplier");
    expect(r.warningCategories).toContain("no-active-price");
  });

  it("price age threshold edges — day 89 green, day 90 green, day 91 yellow", () => {
    // > comparator means day 90 is still green; day 91 first yellow.
    const at = (iso: string) =>
      computeLinePipState({ qty: "1", component: comp({ active_price_updated_at: iso }), nowMs: NOW }).color;
    expect(at("2026-01-26T12:00:00Z")).toBe("green"); // 89 days
    expect(at("2026-01-25T12:00:00Z")).toBe("green"); // 90 days exactly
    expect(at("2026-01-24T12:00:00Z")).toBe("yellow"); // 91 days
  });

  it("price age 180 days = stale-price; 181 days = strong-stale-price", () => {
    const r180 = computeLinePipState({
      qty: "1",
      component: comp({ active_price_updated_at: "2025-10-27T12:00:00Z" }),
      nowMs: NOW,
    });
    expect(r180.color).toBe("yellow");
    expect(r180.warningCategories).toContain("stale-price");
    expect(r180.warningCategories).not.toContain("strong-stale-price");
    expect(r180.reasons.some((s) => /^מחיר ישן \(/.test(s))).toBe(true);

    const r181 = computeLinePipState({
      qty: "1",
      component: comp({ active_price_updated_at: "2025-10-26T12:00:00Z" }),
      nowMs: NOW,
    });
    expect(r181.color).toBe("yellow");
    expect(r181.warningCategories).toContain("strong-stale-price");
    expect(r181.warningCategories).not.toContain("stale-price");
    expect(r181.reasons.some((s) => s.startsWith("מחיר ישן מאוד"))).toBe(true);
  });
});
