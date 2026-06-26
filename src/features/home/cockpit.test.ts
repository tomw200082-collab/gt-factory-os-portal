import { describe, expect, it } from "vitest";

import type { Role } from "@/lib/contracts/enums";
import { ROLES } from "@/lib/contracts/enums";
import {
  HOME_TILES,
  buildHomeCockpit,
  isTileVisible,
  tileText,
  type HomeCockpitView,
  type HomeTile,
} from "./cockpit";

function allTiles(view: HomeCockpitView): HomeTile[] {
  const tiles = view.groups.flatMap((g) => g.tiles);
  return view.primary ? [view.primary, ...tiles] : tiles;
}

describe("buildHomeCockpit — per-role primary + language", () => {
  it("owner/admin lands on the Dashboard (pulse), English LTR", () => {
    const view = buildHomeCockpit("admin");
    expect(view.primary?.href).toBe("/dashboard");
    expect(view.lang).toBe("en");
    expect(view.dir).toBe("ltr");
  });

  it("planner lands on Procurement (the weekly buy), English LTR", () => {
    const view = buildHomeCockpit("planner");
    expect(view.primary?.href).toBe("/planning/procurement");
    expect(view.lang).toBe("en");
  });

  it("operator lands on the Production report, English LTR", () => {
    const view = buildHomeCockpit("operator");
    expect(view.primary?.href).toBe("/stock/production-actual");
    expect(view.lang).toBe("en");
  });

  it("bookkeeper/office (viewer) lands on Credit tracking, Hebrew RTL", () => {
    const view = buildHomeCockpit("viewer");
    expect(view.primary?.href).toBe("/credit-tracking");
    expect(view.lang).toBe("he");
    expect(view.dir).toBe("rtl");
  });
});

describe("buildHomeCockpit — never offers an inaccessible tile", () => {
  it.each(ROLES)("every tile in the %s cockpit clears the role gate", (role: Role) => {
    const view = buildHomeCockpit(role);
    for (const tile of allTiles(view)) {
      expect(isTileVisible(role, tile)).toBe(true);
    }
  });

  it("operator is never shown a planning:execute or admin:execute tile", () => {
    const reqs = allTiles(buildHomeCockpit("operator")).map((t) => t.required);
    expect(reqs).not.toContain("planning:execute");
    expect(reqs).not.toContain("admin:execute");
  });

  it("bookkeeper (viewer) is never shown a stock/planning/admin EXECUTE tile", () => {
    const reqs = allTiles(buildHomeCockpit("viewer")).map((t) => t.required);
    expect(reqs).not.toContain("stock:execute");
    expect(reqs).not.toContain("planning:execute");
    expect(reqs).not.toContain("admin:execute");
  });
});

describe("buildHomeCockpit — role tailoring (not role locking)", () => {
  it("admin sees a superset of every other role's tiles (sees everything)", () => {
    const adminHrefs = new Set(
      HOME_TILES.filter((t) => isTileVisible("admin", t)).map((t) => t.href),
    );
    for (const role of ROLES) {
      for (const tile of HOME_TILES) {
        if (isTileVisible(role, tile)) {
          expect(adminHrefs.has(tile.href)).toBe(true);
        }
      }
    }
  });

  it("admin features every group (overview, triage, planning, office, stock, admin)", () => {
    const keys = buildHomeCockpit("admin").groups.map((g) => g.key);
    for (const k of ["overview", "triage", "planning", "office", "stock", "admin"] as const) {
      expect(keys).toContain(k);
    }
  });

  it("only the admin cockpit exposes the Admin group", () => {
    expect(buildHomeCockpit("planner").groups.map((g) => g.key)).not.toContain("admin");
    expect(buildHomeCockpit("operator").groups.map((g) => g.key)).not.toContain("admin");
    expect(buildHomeCockpit("viewer").groups.map((g) => g.key)).not.toContain("admin");
  });

  it("planner gets Orders to place but not the admin-only Price updates", () => {
    const hrefs = allTiles(buildHomeCockpit("planner")).map((t) => t.href);
    expect(hrefs).toContain("/purchase-orders/placement-queue");
    expect(hrefs).not.toContain("/admin/cost-drafts");
  });
});

describe("buildHomeCockpit — front-door discipline", () => {
  it.each(ROLES)("keeps every group in the %s cockpit at or under 7 tiles", (role: Role) => {
    for (const group of buildHomeCockpit(role).groups) {
      expect(group.tiles.length).toBeLessThanOrEqual(7);
    }
  });

  it("never repeats the primary tile inside a group", () => {
    for (const role of ROLES) {
      const view = buildHomeCockpit(role);
      const groupHrefs = view.groups.flatMap((g) => g.tiles.map((t) => t.href));
      if (view.primary) expect(groupHrefs).not.toContain(view.primary.href);
    }
  });
});

describe("tileText — language resolution", () => {
  it("returns Hebrew strings when lang is he and the tile has them", () => {
    const credit = HOME_TILES.find((t) => t.href === "/credit-tracking")!;
    expect(tileText(credit, "he").label).toBe("מעקב זיכויים");
  });

  it("falls back to English when a tile has no Hebrew strings", () => {
    const forecast = HOME_TILES.find((t) => t.href === "/planning/forecast")!;
    expect(forecast.he).toBeUndefined();
    expect(tileText(forecast, "he").label).toBe(forecast.label);
  });
});
