import { describe, it, expect } from "vitest";
import { ROLES, type Role } from "@/lib/contracts/enums";
import {
  ROLE_CAPABILITY_LATTICE,
  authorizeCapability,
  isCapabilityPermanentlyUnreachable,
} from "@/lib/auth/authorize";
import { NAV_ROLE_ORDER } from "@/lib/nav/manifest";
import { ROLE_COCKPIT, buildHomeCockpit } from "@/features/home/cockpit";

// ---------------------------------------------------------------------------
// S3 — the sales axis.
//
// The sales workspace bypassed this lattice entirely: every endpoint asked
// `session.role !== 'admin'` and the layout gate asked for `admin:execute`, so
// letting a second person work leads meant making them a system administrator.
// Tom's decision (2026-08-24) was a `sales` axis on the existing lattice — not
// a fourth registry, and not by widening `admin|planner`.
// ---------------------------------------------------------------------------

describe("the sales capability", () => {
  it("is held by sales_rep and admin, and by nobody else", () => {
    const holders = ROLES.filter((r) => authorizeCapability(r, "sales:execute"));
    expect([...holders].sort()).toEqual(["admin", "sales_rep"]);
  });

  it("is not granted to planner, which is the whole point of a new role", () => {
    // Making `planner` a sales role would also hand the workspace to the
    // accounting planner, which nobody asked for. This is the alternative the
    // decision rejected, kept here so it cannot be re-adopted by accident.
    expect(ROLE_CAPABILITY_LATTICE.planner.sales).toBeNull();
    expect(authorizeCapability("planner", "sales:read")).toBe(false);
  });

  it("gives a sales rep no execute standing anywhere in the factory", () => {
    expect(authorizeCapability("sales_rep", "stock:execute")).toBe(false);
    expect(authorizeCapability("sales_rep", "planning:execute")).toBe(false);
    expect(authorizeCapability("sales_rep", "admin:read")).toBe(false);
  });

  it("hides the factory rails from a sales rep rather than padlocking them", () => {
    // The lattice's own rule: a row the role can NEVER satisfy is noise, not
    // information. sales_rep holds nothing on those axes, so all three are
    // permanently unreachable.
    for (const req of ["stock:execute", "planning:execute", "admin:execute"] as const) {
      expect(isCapabilityPermanentlyUnreachable("sales_rep", req)).toBe(true);
    }
  });

  it("ranks a sales rep below the factory floor, not on it", () => {
    // Rank 0 rather than a rung on the viewer→admin ladder: every factory nav
    // entry floors at viewer, so none of them is ever listed for a sales rep.
    expect(NAV_ROLE_ORDER.sales_rep).toBe(0);
    expect(NAV_ROLE_ORDER.sales_rep).toBeLessThan(NAV_ROLE_ORDER.viewer);
  });

  it("lands a sales rep on their queue and on nothing else", () => {
    const view = buildHomeCockpit("sales_rep");
    expect(view.primary?.href).toBe("/sales/today");
    expect(view.groups).toEqual([]);
    // CLAUDE.md scopes /home's Hebrew exception to the viewer cockpit alone,
    // and that list is complete — the Hebrew surfaces live inside (sales).
    expect(ROLE_COCKPIT.sales_rep.lang).toBe("en");
    expect(ROLE_COCKPIT.sales_rep.dir).toBe("ltr");
  });

  it("keeps every role's grants total, so a new axis cannot be half-added", () => {
    // Record<Role, …> is compile-time; this is the runtime half — a role added
    // to ROLES without a lattice row would pass tsc via an `as` somewhere and
    // then deny everything silently.
    for (const role of ROLES) {
      const grants = ROLE_CAPABILITY_LATTICE[role as Role];
      expect(grants, `no lattice row for ${role}`).toBeTruthy();
      expect(Object.keys(grants).sort()).toEqual(["admin", "planning", "sales", "stock"]);
    }
  });
});
