import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/contracts/enums";
import {
  NAV_MANIFEST,
  navItemAllowsRole,
  type NavItem,
} from "@/lib/nav/manifest";
import { sidebarHrefsForRole } from "@/lib/nav/visible";
import { isCapabilityPermanentlyUnreachable } from "@/lib/auth/authorize";

// Tranche 138 (lean-nav). These are the per-role visible-sidebar-row snapshots
// the manifest evidence plan calls for. They pin the D1 fold list + the D2
// never-grantable hide rule so a future manifest edit can't silently re-inflate
// a role's rail or re-expose a permanently-locked row.

function itemByHref(href: string): NavItem {
  const found = NAV_MANIFEST.flatMap((g) => g.items).find((i) => i.href === href);
  if (!found) throw new Error(`manifest has no item ${href}`);
  return found;
}

describe("sidebar visibility — per-role snapshots (D1 fold list)", () => {
  it("viewer (bookkeeper) sees a lean office/read rail, no locked stock forms", () => {
    expect(sidebarHrefsForRole("viewer")).toEqual([
      "/credit-tracking",
      "/inventory",
      "/stock/movement-log",
      "/planning/production-plan",
      "/planning/inventory-flow",
      "/purchase-orders",
    ]);
  });

  it("operator (Dennis/Maxim) sees stock forms + plan, not office/credit/planner surfaces", () => {
    expect(sidebarHrefsForRole("operator")).toEqual([
      "/production",
      "/stock/receipts",
      "/stock/waste-adjustments",
      "/stock/physical-count",
      "/inventory",
      "/planning/production-plan",
      "/planning/inventory-flow",
      "/purchase-orders",
      "/me/activity",
    ]);
  });

  it("planner (Dorin/Tom) keeps credit-tracking + movement-log + the planning cadence", () => {
    const hrefs = sidebarHrefsForRole("planner");
    expect(hrefs).toContain("/credit-tracking");
    expect(hrefs).toContain("/stock/movement-log");
    expect(hrefs).toContain("/planning");
    expect(hrefs).toContain("/planning/forecast");
    expect(hrefs).toContain("/planning/meeting");
    expect(hrefs).toContain("/purchase-orders/placement-queue");
  });

  it("admin sees every side-placed row (superset), including the office allow-list items", () => {
    const hrefs = sidebarHrefsForRole("admin");
    expect(hrefs).toContain("/credit-tracking");
    expect(hrefs).toContain("/stock/movement-log");
    expect(hrefs).toContain("/admin/items");
    // admin is a superset of every other role's visible rail
    for (const role of ROLES) {
      for (const href of sidebarHrefsForRole(role)) {
        expect(hrefs).toContain(href);
      }
    }
  });
});

describe("operator scoping (roles allow-list overrides the min_role floor)", () => {
  it("credit-tracking + movement-log are out of the operator rail but in for viewer/planner/admin", () => {
    for (const href of ["/credit-tracking", "/stock/movement-log"]) {
      expect(sidebarHrefsForRole("operator")).not.toContain(href);
      expect(sidebarHrefsForRole("viewer")).toContain(href);
      expect(sidebarHrefsForRole("planner")).toContain(href);
      expect(sidebarHrefsForRole("admin")).toContain(href);
    }
  });

  it("navItemAllowsRole honors the exact allow-list, not just the floor", () => {
    const credit = itemByHref("/credit-tracking");
    expect(credit.roles).toEqual(["viewer", "planner", "admin"]);
    expect(navItemAllowsRole("operator", credit)).toBe(false);
    expect(navItemAllowsRole("viewer", credit)).toBe(true);
  });
});

describe("min_role raises (Planning Overview + Forecast → planner)", () => {
  it("are hidden from viewer + operator, present for planner + admin", () => {
    for (const href of ["/planning", "/planning/forecast"]) {
      expect(sidebarHrefsForRole("viewer")).not.toContain(href);
      expect(sidebarHrefsForRole("operator")).not.toContain(href);
      expect(sidebarHrefsForRole("planner")).toContain(href);
      expect(sidebarHrefsForRole("admin")).toContain(href);
    }
  });
});

describe("placement:command folds (production-simulation, blockers)", () => {
  it("are absent from every role's sidebar", () => {
    for (const role of ROLES) {
      expect(sidebarHrefsForRole(role)).not.toContain("/planning/production-simulation");
      expect(sidebarHrefsForRole(role)).not.toContain("/planning/blockers");
    }
  });

  it("but stay in NAV_MANIFEST so ⌘K + deep links still resolve them", () => {
    // Still present as manifest entries (CommandPalette + active-path source).
    expect(itemByHref("/planning/production-simulation").placement).toBe("command");
    expect(itemByHref("/planning/blockers").placement).toBe("command");
    // And the command palette (navItemAllowsRole over the whole manifest,
    // no placement filter) still admits them for a role that meets the floor.
    expect(navItemAllowsRole("planner", itemByHref("/planning/production-simulation"))).toBe(true);
    expect(navItemAllowsRole("admin", itemByHref("/planning/blockers"))).toBe(true);
  });
});

describe("D2 — never-grantable rows are HIDDEN, attainable rows stay subdued", () => {
  it("hides the viewer's permanently-locked stock:execute rows (3 forms + My activity)", () => {
    const viewer = sidebarHrefsForRole("viewer");
    for (const href of [
      "/stock/receipts",
      "/stock/waste-adjustments",
      "/stock/physical-count",
      "/me/activity",
    ]) {
      expect(viewer).not.toContain(href);
    }
  });

  it("isCapabilityPermanentlyUnreachable: read-only-on-axis ⇒ permanent (hide)", () => {
    // viewer holds only stock:read → can never execute → permanent.
    expect(isCapabilityPermanentlyUnreachable("viewer", "stock:execute")).toBe(true);
    expect(isCapabilityPermanentlyUnreachable("viewer", "planning:execute")).toBe(true);
    // operator has no admin standing at all → permanent.
    expect(isCapabilityPermanentlyUnreachable("operator", "admin:execute")).toBe(true);
  });

  it("isCapabilityPermanentlyUnreachable: already-held ⇒ not unreachable (nothing to hide)", () => {
    expect(isCapabilityPermanentlyUnreachable("operator", "stock:execute")).toBe(false);
    expect(isCapabilityPermanentlyUnreachable("planner", "planning:execute")).toBe(false);
    expect(isCapabilityPermanentlyUnreachable("viewer", "viewer:read")).toBe(false);
  });

  it("isCapabilityPermanentlyUnreachable: executing-but-below-override ⇒ attainable (keep subdued)", () => {
    // The safety valve: a role that already EXECUTES on an axis but lacks the
    // higher override tier is one grant away, so it must NOT be hidden — it
    // keeps the truthful subdued padlock.
    expect(isCapabilityPermanentlyUnreachable("operator", "stock:execute+override")).toBe(false);
  });
});

describe("nav visibility never changes route ACCESS", () => {
  it("every folded href is still a real manifest entry (route untouched)", () => {
    // The tranche prunes VISIBILITY only. Each pruned/scoped/demoted target
    // must still exist in the manifest so its page, ⌘K entry, and breadcrumb
    // label keep working.
    for (const href of [
      "/credit-tracking",
      "/stock/movement-log",
      "/planning",
      "/planning/forecast",
      "/planning/production-simulation",
      "/planning/blockers",
    ]) {
      expect(() => itemByHref(href)).not.toThrow();
    }
  });
});
