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
//
// Tranche 175 (Tom, 2026-08-25) widened it to `planner` after all, with the
// cost named and accepted: Alex and Avi plan production and work leads, a user
// holds one role, and the api gates the factory on 61 `role === 'planner'`
// literals that a sixth role would have to be taught one by one. The
// bookkeeper is a planner and now sees the lead queue. That is the trade, not
// an oversight — these assertions exist so it stays a decision.
// ---------------------------------------------------------------------------

describe("the sales capability", () => {
  it("is held by sales_rep, planner and admin, and by nobody else", () => {
    const holders = ROLES.filter((r) => authorizeCapability(r, "sales:execute"));
    expect([...holders].sort()).toEqual(["admin", "planner", "sales_rep"]);
  });

  it("still reaches nobody below planner — operator and viewer hold nothing", () => {
    // The half of 173's isolation that survives 175. Widening went one row, not
    // to everyone authenticated: the floor people are the ones who would have
    // no business in a lead queue and no way to tell it was a mistake.
    expect(ROLE_CAPABILITY_LATTICE.operator.sales).toBeNull();
    expect(ROLE_CAPABILITY_LATTICE.viewer.sales).toBeNull();
    expect(authorizeCapability("operator", "sales:read")).toBe(false);
    expect(authorizeCapability("viewer", "sales:read")).toBe(false);
  });

  it("gives a selling planner the factory too — the point of widening it", () => {
    // Why 174's sales_planner was reverted: a planner already passes every
    // factory gate, on both halves. Granting the sales axis to the role they
    // already hold is the whole change.
    expect(authorizeCapability("planner", "sales:execute")).toBe(true);
    expect(authorizeCapability("planner", "stock:execute")).toBe(true);
    expect(authorizeCapability("planner", "planning:execute+override")).toBe(true);
    expect(ROLE_CAPABILITY_LATTICE.planner.admin).toBeNull();
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
