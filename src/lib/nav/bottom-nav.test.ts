// Tranche 051 — unit tests for the pure bottom-nav helpers (FLOW-016).
import { describe, expect, it } from "vitest";

import {
  BOTTOM_NAV_TABS,
  bottomTabTestId,
  filterBottomNavByRole,
  isBottomTabActive,
} from "./bottom-nav";

describe("BOTTOM_NAV_TABS", () => {
  it("contains exactly the five curated mobile tabs in order", () => {
    expect(BOTTOM_NAV_TABS.map((t) => t.href)).toEqual([
      "/dashboard",
      "/planning/production-plan",
      "/planning/procurement",
      "/inventory",
      "/inbox",
    ]);
  });

  it("derives min_role from the nav manifest (drift guard)", () => {
    const byHref = Object.fromEntries(
      BOTTOM_NAV_TABS.map((t) => [t.href, t.min_role]),
    );
    // These mirror src/lib/nav/manifest.ts at the time of Tranche 051.
    // If the manifest changes, the lookup should change with it and these
    // expectations should be updated deliberately.
    expect(byHref["/dashboard"]).toBe("viewer");
    expect(byHref["/planning/production-plan"]).toBe("viewer");
    expect(byHref["/planning/procurement"]).toBe("planner");
    expect(byHref["/inventory"]).toBe("viewer");
    expect(byHref["/inbox"]).toBe("viewer");
  });
});

describe("filterBottomNavByRole", () => {
  it("hides planner-gated Procurement from viewer and operator", () => {
    for (const role of ["viewer", "operator"] as const) {
      const hrefs = filterBottomNavByRole(role).map((t) => t.href);
      expect(hrefs).not.toContain("/planning/procurement");
      expect(hrefs).toHaveLength(4);
    }
  });

  it("shows all five tabs to planner and admin", () => {
    for (const role of ["planner", "admin"] as const) {
      expect(filterBottomNavByRole(role)).toHaveLength(5);
    }
  });

  it("shows all five tabs when the role is unknown (middleware gates anyway)", () => {
    expect(filterBottomNavByRole(null)).toHaveLength(5);
  });

  it("preserves manifest tab order after filtering", () => {
    expect(filterBottomNavByRole("operator").map((t) => t.href)).toEqual([
      "/dashboard",
      "/planning/production-plan",
      "/inventory",
      "/inbox",
    ]);
  });
});

describe("isBottomTabActive", () => {
  it("matches the exact route", () => {
    expect(isBottomTabActive("/inventory", "/inventory")).toBe(true);
  });

  it("matches child routes by path segment", () => {
    expect(isBottomTabActive("/inventory/ITEM-1", "/inventory")).toBe(true);
    expect(
      isBottomTabActive(
        "/planning/production-plan/2026-06-11",
        "/planning/production-plan",
      ),
    ).toBe(true);
  });

  it("does NOT match sibling routes that merely share a string prefix", () => {
    expect(isBottomTabActive("/inventory-flow", "/inventory")).toBe(false);
    expect(
      isBottomTabActive("/planning/production-simulation", "/planning/production-plan"),
    ).toBe(false);
  });

  it("does not mark a parent route active for a deeper tab", () => {
    expect(isBottomTabActive("/planning", "/planning/production-plan")).toBe(false);
  });

  it("is false for a null pathname", () => {
    expect(isBottomTabActive(null, "/dashboard")).toBe(false);
  });
});

describe("bottomTabTestId", () => {
  it("uses the final path segment as the slug", () => {
    expect(bottomTabTestId("/dashboard")).toBe("mobile-bottom-nav-dashboard");
    expect(bottomTabTestId("/planning/production-plan")).toBe(
      "mobile-bottom-nav-production-plan",
    );
  });
});
